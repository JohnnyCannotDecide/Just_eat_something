import { hashRecordData } from './hash'
import type {
  SyncBaselineEntry,
  SyncPendingEntry,
} from './types'
import type { CanonicalMap } from './canonical'

export interface PendingUpdateInput {
  records: CanonicalMap
  baseline: Record<string, SyncBaselineEntry>
  pending: Record<string, SyncPendingEntry>
  nextStamp: () => number
}

export interface PendingUpdateOutput {
  pending: Record<string, SyncPendingEntry>
}

/**
 * 纯函数：对比当前记录、baseline 和 pending，得到需要推送的变更。
 * 覆盖所有写路径（store 的订阅只关心 data 引用变化），并保证：
 * - 已同步且内容未变的记录不产生 pending；
 * - 已同步记录被删 → 墓碑；
 * - 打卡事件永不生成墓碑；
 * - pending 里的旧时间戳在内容未变时保持不变（离线队列稳定）。
 */
export function updatePendingChanges(
  input: PendingUpdateInput,
): PendingUpdateOutput {
  const pending: Record<string, SyncPendingEntry> = { ...input.pending }
  const keys = new Set<string>([
    ...input.records.keys(),
    ...Object.keys(input.baseline),
    ...Object.keys(input.pending),
  ])

  for (const key of keys) {
    const record = input.records.get(key)
    // 本地删除时 record 已不存在，集合信息必须从 key 前缀判断。
    const isCheckin = key.startsWith('checkins/')
    const localPending = input.pending[key]
    const base = input.baseline[key]

    if (record) {
      const localHash = hashRecordData(record.data)
      if (localPending) {
        if (localPending.deleted) {
          // 删除后又重新创建：内容必须作为新编辑推送。
          pending[key] = {
            hash: localHash,
            updatedAt: input.nextStamp(),
            deleted: false,
          }
        } else if (localPending.hash !== localHash) {
          pending[key] = {
            hash: localHash,
            updatedAt: input.nextStamp(),
            deleted: false,
          }
        }
        continue
      }

      if (base) {
        if (base.hash !== localHash) {
          pending[key] = {
            hash: localHash,
            updatedAt: input.nextStamp(),
            deleted: false,
          }
        }
        continue
      }

      // 没有 baseline 也没有 pending：本地新增。
      pending[key] = {
        hash: localHash,
        updatedAt: input.nextStamp(),
        deleted: false,
      }
      continue
    }

    // 本地已不存在。
    if (isCheckin) {
      // 打卡事件只增不删；忽略任何本地缺失。
      delete pending[key]
      continue
    }

    if (localPending) {
      if (localPending.deleted) {
        continue
      }
      if (!base) {
        // 从未同步过，没有云端行需要删除。
        delete pending[key]
        continue
      }
      pending[key] = {
        hash: base.hash,
        updatedAt: input.nextStamp(),
        deleted: true,
      }
      continue
    }

    if (base) {
      pending[key] = {
        hash: base.hash,
        updatedAt: input.nextStamp(),
        deleted: true,
      }
    }
  }

  return { pending }
}
