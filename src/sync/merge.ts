import { hashRecordData } from './hash'
import type {
  SyncBaselineEntry,
  SyncPendingEntry,
} from './types'
import type { CanonicalMap, CanonicalRecord } from './canonical'
import type { SyncCollection } from '@/core/sync/protocol'

export interface CloudRecordInput {
  key: string
  collection: SyncCollection
  id: string
  /** 已解析的 JSON；解析失败时由调用方跳过并记录 warning。 */
  data: unknown
  updatedAt: number
  deviceId: string
  deleted: boolean
  rev: number
}

export interface MergeInput {
  local: CanonicalMap
  pending: Record<string, SyncPendingEntry>
  baseline: Record<string, SyncBaselineEntry>
  /** 本轮 pull 返回的云端行（增量或全量均可）。 */
  cloud: readonly CloudRecordInput[]
  /** 本机设备 id；本地待推送变更的时间戳属于本机。 */
  deviceId: string
  /** 本地 Lamport 时间戳；返回后保证比之前更大。 */
  nextStamp: () => number
}

export interface MergeOutput {
  records: CanonicalMap
  pending: Record<string, SyncPendingEntry>
  baseline: Record<string, SyncBaselineEntry>
  warnings: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function localVersion(
  key: string,
  pending: Record<string, SyncPendingEntry>,
  baseline: Record<string, SyncBaselineEntry>,
  deviceId: string,
): { updatedAt: number; deviceId: string } | null {
  const localPending = pending[key]
  if (localPending) {
    return { updatedAt: localPending.updatedAt, deviceId }
  }
  const base = baseline[key]
  if (base) {
    return { updatedAt: base.updatedAt, deviceId: base.deviceId }
  }
  return null
}

function compareVersion(
  local: { updatedAt: number; deviceId: string },
  cloud: { updatedAt: number; deviceId: string },
): number {
  if (local.updatedAt !== cloud.updatedAt) {
    return local.updatedAt - cloud.updatedAt
  }
  if (local.deviceId === cloud.deviceId) {
    return 0
  }
  return local.deviceId < cloud.deviceId ? -1 : 1
}

/**
 * 把本轮拉到的云端行合入本地。只处理云端返回的 key：
 * 增量 pull 没返回的 key 不代表云端删除，未返回的本地改动继续留在 pending。
 *
 * - 普通记录：LWW（updatedAt 相同按 deviceId）；
 * - 云端墓碑更新 → 删除本地；本地更新更晚 → 允许复活；
 * - 打卡事件：并集、只增不删；同 id 内容冲突保留云端并记 warning。
 */
export function mergeCloudRecords(input: MergeInput): MergeOutput {
  const records: CanonicalMap = new Map(input.local)
  const pending: Record<string, SyncPendingEntry> = { ...input.pending }
  const baseline: Record<string, SyncBaselineEntry> = {
    ...input.baseline,
  }
  const warnings: string[] = []

  for (const cloud of input.cloud) {
    const local = records.get(cloud.key)

    if (cloud.collection === 'checkins') {
      if (cloud.deleted) {
        // 事件不可变，云端不应出现墓碑；忽略而不删除本地。
        continue
      }
      if (!isRecord(cloud.data)) {
        warnings.push(`打卡事件 ${cloud.key} 内容无效，已跳过`)
        continue
      }
      if (local) {
        if (hashRecordData(local.data) !== hashRecordData(cloud.data)) {
          warnings.push(`打卡事件 ${cloud.key} 内容冲突，已保留云端版本`)
          records.set(cloud.key, {
            collection: cloud.collection,
            id: cloud.id,
            data: cloud.data,
          })
        }
      } else {
        records.set(cloud.key, {
          collection: cloud.collection,
          id: cloud.id,
          data: cloud.data,
        })
      }
      baseline[cloud.key] = {
        hash: hashRecordData(cloud.data),
        updatedAt: cloud.updatedAt,
        deviceId: cloud.deviceId,
        rev: cloud.rev,
      }
      delete pending[cloud.key]
      continue
    }

    if (cloud.deleted) {
      if (!local) {
        delete pending[cloud.key]
        delete baseline[cloud.key]
        continue
      }

      const version = localVersion(
        cloud.key,
        pending,
        baseline,
        input.deviceId,
      )
      if (version && compareVersion(version, cloud) > 0) {
        // 本地编辑晚于墓碑 → 保留并排队复活。
        pending[cloud.key] = {
          hash: hashRecordData(local.data),
          updatedAt: version.updatedAt,
          deleted: false,
        }
        delete baseline[cloud.key]
      } else {
        records.delete(cloud.key)
        delete pending[cloud.key]
        delete baseline[cloud.key]
      }
      continue
    }

    if (!isRecord(cloud.data)) {
      warnings.push(`记录 ${cloud.key} 内容无效，已跳过`)
      continue
    }

    const cloudHash = hashRecordData(cloud.data)
    const cloudEntry: SyncBaselineEntry = {
      hash: cloudHash,
      updatedAt: cloud.updatedAt,
      deviceId: cloud.deviceId,
      rev: cloud.rev,
    }

    if (!local) {
      const localDelete = pending[cloud.key]
      if (localDelete?.deleted) {
        // 本机删除还没推上去；本轮 pull 又把自己旧版本拉回来了。
        // 只要删除时间不早于云端行，就保持删除，不能静默复活。
        const stillDeleted =
          compareVersion(
            { updatedAt: localDelete.updatedAt, deviceId: input.deviceId },
            cloud,
          ) >= 0
        if (stillDeleted) {
          continue
        }
      }
      records.set(cloud.key, {
        collection: cloud.collection,
        id: cloud.id,
        data: cloud.data,
      })
      baseline[cloud.key] = cloudEntry
      delete pending[cloud.key]
      continue
    }

    const localHash = hashRecordData(local.data)
    if (localHash === cloudHash) {
      baseline[cloud.key] = cloudEntry
      delete pending[cloud.key]
      continue
    }

    const version = localVersion(
      cloud.key,
      pending,
      baseline,
      input.deviceId,
    )
    if (version === null || compareVersion(version, cloud) > 0) {
      // 没有版本信息时优先保本地，绝不静默丢数据。
      const updatedAt = pending[cloud.key]
        ? pending[cloud.key]!.updatedAt
        : input.nextStamp()
      pending[cloud.key] = {
        hash: localHash,
        updatedAt,
        deleted: false,
      }
      baseline[cloud.key] = cloudEntry
    } else {
      records.set(cloud.key, {
        collection: cloud.collection,
        id: cloud.id,
        data: cloud.data,
      })
      baseline[cloud.key] = cloudEntry
      delete pending[cloud.key]
    }
  }

  return { records, pending, baseline, warnings }
}

/** 从合并后的记录生成待推送变更。 */
export function pendingChanges(
  pending: Record<string, SyncPendingEntry>,
  records: CanonicalMap,
): {
  changes: {
    key: string
    json?: string
    updatedAt: number
    deleted: boolean
  }[]
  dropped: string[]
} {
  const changes: {
    key: string
    json?: string
    updatedAt: number
    deleted: boolean
  }[] = []
  const dropped: string[] = []

  for (const [key, entry] of Object.entries(pending)) {
    const record: CanonicalRecord | undefined = records.get(key)
    if (entry.deleted) {
      // 打卡事件永不删除。
      if (key.startsWith('checkins/')) {
        dropped.push(key)
        continue
      }
      changes.push({ key, updatedAt: entry.updatedAt, deleted: true })
      continue
    }
    if (!record) {
      dropped.push(key)
      continue
    }
    changes.push({
      key,
      json: JSON.stringify(record.data),
      updatedAt: entry.updatedAt,
      deleted: false,
    })
  }

  return { changes, dropped }
}
