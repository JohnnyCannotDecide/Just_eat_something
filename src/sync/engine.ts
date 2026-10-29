import { SYNC } from '@/config/gameConfig'
import { generateSyncCode, hashSyncCode, normalizeSyncCode } from '@/core/sync/code'
import { isSyncCollection } from '@/core/sync/protocol'
import type { SyncCollection } from '@/core/sync/protocol'
import { collectReferencedImageIds } from '@/storage/backup'
import type {
  BinaryStorageAdapter,
  ImageMime,
} from '@/storage/BinaryStorageAdapter'
import { isImageMime } from '@/storage/BinaryStorageAdapter'
import type { AppData } from '@/storage/appData'
import type { SnapshotService } from '@/storage/snapshots'
import type { SnapshotReason } from '@/storage/SnapshotStore'
import {
  base64ToBytes,
  prepareCloudImage,
} from './cloudImage'
import type { PrepareImage } from './cloudImage'
import {
  canonicalRecords,
  isEffectivelyEmpty,
  joinCanonicalRecords,
} from './canonical'
import type { CanonicalMap, CanonicalRecord } from './canonical'
import { onDestructive } from './destructive'
import { hashBytes, hashRecordData } from './hash'
import { mergeCloudRecords, pendingChanges } from './merge'
import type { CloudRecordInput } from './merge'
import { updatePendingChanges } from './observer'
import {
  createEmptySyncState,
  SyncStateCorruptError,
} from './types'
import type {
  CloudImageData,
  CloudImageMeta,
  CloudImageUpload,
  CloudRecordRow,
  ConnectChoice,
  ConnectResult,
  DestructiveKind,
  PullResult,
  SyncBaselineEntry,
  SyncPendingEntry,
  SyncRunResult,
  SyncRunStatus,
  SyncSidecar,
  SyncState,
  SyncView,
} from './types'
import { SyncTransportError } from './transport'
import type { SyncTransport } from './transport'

type RunMode = 'normal' | 'merge' | 'upload' | 'cloud'

interface RunOptions {
  mode?: RunMode
}

interface PulledRows {
  rows: CloudRecordInput[]
  images: CloudImageMeta[]
  recordRev: number
  imageRev: number
}

export interface EnableResult {
  code: string | null
  error: string | null
}

export interface RotateResult {
  code: string | null
  error: string | null
}

export interface SyncEngineOptions {
  sidecar: SyncSidecar
  transport: SyncTransport
  images: BinaryStorageAdapter
  snapshots?: Pick<SnapshotService, 'capture'>
  prepareImage?: PrepareImage
  now?: () => number
  createDeviceId?: () => string
  isOnline?: () => boolean
}

export interface SyncEngine {
  getView(): Promise<SyncView>
  enable(): Promise<EnableResult>
  connect(
    codeInput: string,
    data: AppData,
    todayKey: string,
  ): Promise<ConnectResult>
  choose(
    kind: ConnectChoice,
    data: AppData,
    todayKey: string,
  ): Promise<SyncRunResult>
  sync(data: AppData, todayKey: string): Promise<SyncRunResult>
  rotate(): Promise<RotateResult>
  disable(): Promise<void>
  forget(): Promise<void>
  dispose(): void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function defaultDeviceId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return `device-${crypto.randomUUID()}`
  }
  return `device-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`
}

function describeError(error: unknown): {
  status: SyncRunStatus
  message: string
} {
  if (error instanceof SyncTransportError) {
    switch (error.kind) {
      case 'unauthorized':
        return { status: 'auth-failed', message: '同步码无效或已失效，请重新输入' }
      case 'network':
        return { status: 'offline', message: '网络不可用，稍后会自动重试' }
      case 'rate-limited':
        return { status: 'error', message: '请求太频繁，请稍后再试' }
      case 'too-large':
        return { status: 'error', message: '数据或图片太大，无法同步' }
      case 'empty-local-protected':
        return {
          status: 'needs-confirm',
          message: '本机数据为空，已阻止覆盖云端数据',
        }
      default:
        return { status: 'error', message: '同步服务器暂时不可用' }
    }
  }
  if (error instanceof SyncStateCorruptError) {
    return { status: 'needs-confirm', message: '同步状态损坏，需要重新确认' }
  }
  return { status: 'error', message: '同步失败，请稍后重试' }
}

function parseCloudRecords(
  rows: readonly CloudRecordRow[],
  warnings: string[],
): CloudRecordInput[] {
  const parsed: CloudRecordInput[] = []
  for (const row of rows) {
    if (!isSyncCollection(row.collection)) {
      warnings.push(`云端记录 ${row.key} 的集合未知，已跳过`)
      continue
    }
    const collection: SyncCollection = row.collection
    if (row.deleted) {
      parsed.push({
        key: row.key,
        collection,
        id: row.id,
        data: null,
        updatedAt: row.updatedAt,
        deviceId: row.deviceId,
        deleted: true,
        rev: row.rev,
      })
      continue
    }
    let data: unknown
    try {
      data = JSON.parse(row.json) as unknown
    } catch {
      warnings.push(`云端记录 ${row.key} 内容损坏，已跳过`)
      continue
    }
    parsed.push({
      key: row.key,
      collection,
      id: row.id,
      data,
      updatedAt: row.updatedAt,
      deviceId: row.deviceId,
      deleted: false,
      rev: row.rev,
    })
  }
  return parsed
}

function baselineFromRows(
  rows: readonly CloudRecordInput[],
): Record<string, SyncBaselineEntry> {
  const baseline: Record<string, SyncBaselineEntry> = {}
  for (const row of rows) {
    if (row.deleted) {
      continue
    }
    baseline[row.key] = {
      hash: hashRecordData(row.data),
      updatedAt: row.updatedAt,
      deviceId: row.deviceId,
      rev: row.rev,
    }
  }
  return baseline
}

function liveRecords(
  records: CanonicalMap,
  pending: Record<string, SyncPendingEntry>,
): CanonicalRecord[] {
  const live: CanonicalRecord[] = []
  for (const [key, record] of records) {
    if (!pending[key]?.deleted) {
      live.push(record)
    }
  }
  return live
}

function canonicalMapsEqual(left: AppData, right: AppData): boolean {
  const a = canonicalRecords(left)
  const b = canonicalRecords(right)
  if (a.size !== b.size) {
    return false
  }
  for (const [key, record] of a) {
    const other = b.get(key)
    if (!other || hashRecordData(record.data) !== hashRecordData(other.data)) {
      return false
    }
  }
  return true
}

function resetSyncHistory(state: SyncState, now: number): void {
  state.recordRev = 0
  state.imageRev = 0
  state.lastSyncedAt = null
  state.lastStamp = now
  state.lastError = null
  state.needsReconcile = null
  state.baseline = {}
  state.pending = {}
  state.images = {}
  state.imageWarnings = []
}

/**
 * 客户端同步引擎。只处理记录/图片与 sidecar，不直接写 AppData：
 * 需要覆盖本地时返回新数据，由 store 的串行队列落盘。
 */
export function createSyncEngine(options: SyncEngineOptions): SyncEngine {
  const {
    sidecar,
    transport,
    images,
    snapshots,
    prepareImage = prepareCloudImage,
    now = () => Date.now(),
    createDeviceId = defaultDeviceId,
    isOnline = () =>
      typeof navigator === 'undefined' || navigator.onLine !== false,
  } = options

  let queue: Promise<unknown> = Promise.resolve()
  let destructivePending: DestructiveKind | null = null
  let pendingConnect: string | null = null

  const disposeDestructive = onDestructive((kind) => {
    destructivePending = kind
    // 立即持久化，避免用户马上刷新时把清空误判成删除并上传墓碑。
    void enqueue(() => persistDestructive(kind))
  })

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task, task)
    queue = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  function withTabLock<T>(task: () => Promise<T>): Promise<T> {
    const locks =
      typeof navigator !== 'undefined'
        ? (navigator as Navigator & { locks?: LockManager }).locks
        : undefined
    if (!locks) {
      return task()
    }
    return locks.request('diet-diary-sync', () => task())
  }

  async function safeGetState(): Promise<SyncState | null> {
    try {
      return await sidecar.getState()
    } catch (error) {
      if (error instanceof SyncStateCorruptError) {
        return null
      }
      return null
    }
  }

  async function persistDestructive(kind: DestructiveKind): Promise<void> {
    try {
      const state = (await sidecar.getState()) ?? null
      const next = state ?? createEmptySyncState(createDeviceId(), now())
      next.needsReconcile = kind
      next.pending = {}
      next.status = 'needs-confirm'
      next.lastError = null
      await sidecar.setState(next)
    } catch {
      // 同步状态读写失败不影响主数据；engine 内部仍持有 destructivePending。
    }
  }

  async function attach(
    code: string,
    options: { lostHistory?: boolean } = {},
  ): Promise<SyncState> {
    const existing = await safeGetState()
    const previousCode = await sidecar.getCode().catch(() => null)
    const state =
      existing ?? createEmptySyncState(createDeviceId(), now())

    if (previousCode && previousCode !== code) {
      // 换了一个同步码 = 换账号，旧账号的历史和待推送全部作废。
      resetSyncHistory(state, now())
      state.status = 'idle'
    }

    if (existing === null && options.lostHistory) {
      state.needsReconcile = 'recovery'
      state.status = 'needs-confirm'
    } else if (state.status === 'disabled' || state.status === 'auth-failed') {
      state.status = 'idle'
    }

    state.enabled = true
    state.lastError = null
    await sidecar.setCode(code)
    await sidecar.setState(state)
    return state
  }

  async function pullAll(
    code: string,
    startRecordRev: number,
    startImageRev: number,
    warnings: string[],
  ): Promise<PulledRows> {
    let recordRev = startRecordRev
    let imageRev = startImageRev
    const rawRecords: CloudRecordRow[] = []
    const imageMetas: CloudImageMeta[] = []

    for (let page = 0; page < 500; page += 1) {
      const result: PullResult = await transport.pull(code, {
        recordRev,
        imageRev,
      })
      rawRecords.push(...result.records)
      imageMetas.push(...result.images)

      const progressed =
        result.recordRev !== recordRev ||
        result.imageRev !== imageRev ||
        result.records.length > 0 ||
        result.images.length > 0

      recordRev = result.recordRev
      imageRev = result.imageRev

      if (!result.hasMoreRecords && !result.hasMoreImages) {
        return {
          rows: parseCloudRecords(rawRecords, warnings),
          images: imageMetas,
          recordRev,
          imageRev,
        }
      }
      if (!progressed) {
        throw new SyncTransportError('server')
      }
    }

    throw new SyncTransportError('server')
  }

  async function capture(
    reason: SnapshotReason,
    data: AppData,
  ): Promise<void> {
    if (!snapshots) {
      return
    }
    await snapshots.capture({ reason, data })
  }

  async function uploadImages(
    code: string,
    data: AppData,
    state: SyncState,
    nextStamp: () => number,
    warnings: string[],
  ): Promise<void> {
    const pendingUploads: {
      upload: CloudImageUpload
      hash: string
    }[] = []

    for (const id of collectReferencedImageIds(data)) {
      const image = await images.getImage(id)
      if (!image) {
        continue
      }
      const contentHash = hashBytes(image.bytes)
      if (state.images[id]?.hash === contentHash) {
        continue
      }

      let prepared
      try {
        prepared = await prepareImage(image)
      } catch {
        prepared = null
      }
      if (!prepared) {
        warnings.push(`图片 ${id} 压缩后仍超过限制，已跳过同步`)
        continue
      }
      if (prepared.byteLength > SYNC.cloudImageServerMaxBytes) {
        warnings.push(`图片 ${id} 超过云端单图上限，已跳过同步`)
        continue
      }

      pendingUploads.push({
        upload: {
          id,
          mime: prepared.mime,
          base64: prepared.base64,
          updatedAt: nextStamp(),
        },
        hash: contentHash,
      })
    }

    for (let index = 0; index < pendingUploads.length; index += SYNC.maxImagesPerPush) {
      const batch = pendingUploads.slice(
        index,
        index + SYNC.maxImagesPerPush,
      )
      await transport.putImages(code, {
        deviceId: state.deviceId,
        images: batch.map((item) => item.upload),
      })
      for (const item of batch) {
        state.images[item.upload.id] = {
          hash: item.hash,
          updatedAt: item.upload.updatedAt,
        }
      }
    }
  }

  async function downloadImages(
    code: string,
    data: AppData,
    metas: readonly CloudImageMeta[],
    state: SyncState,
    warnings: string[],
  ): Promise<void> {
    const referenced = new Set(collectReferencedImageIds(data))
    const live = new Map<string, CloudImageMeta>()
    for (const meta of metas) {
      if (!meta.deleted && referenced.has(meta.id)) {
        live.set(meta.id, meta)
      }
    }

    const missing: string[] = []
    for (const id of live.keys()) {
      const local = await images.getImage(id)
      if (!local) {
        missing.push(id)
      }
    }

    for (let index = 0; index < missing.length; index += SYNC.maxImagesPerGet) {
      const batch = missing.slice(index, index + SYNC.maxImagesPerGet)
      const fetched: CloudImageData[] = await transport.getImages(code, batch)
      for (const image of fetched) {
        if (!isImageMime(image.mime)) {
          warnings.push(`云端图片 ${image.id} 格式不支持，已跳过`)
          continue
        }
        const bytes = base64ToBytes(image.data)
        if (!bytes) {
          warnings.push(`云端图片 ${image.id} 内容损坏，已跳过`)
          continue
        }
        if (bytes.byteLength > SYNC.cloudImageServerMaxBytes) {
          warnings.push(`云端图片 ${image.id} 超过本地限制，已跳过`)
          continue
        }
        // 已存在的本地图片绝不覆盖。
        if (await images.getImage(image.id)) {
          continue
        }
        const mime: ImageMime = image.mime
        await images.putImage(image.id, { mime, bytes })
        state.images[image.id] = {
          hash: hashBytes(bytes),
          updatedAt: image.updatedAt,
        }
      }
    }
  }

  function failedResult(
    state: SyncState | null,
    error: unknown,
    warnings: string[],
  ): SyncRunResult {
    const mapped = describeError(error)
    if (state) {
      state.status = mapped.status
      state.lastError = mapped.message
    }
    return {
      status: mapped.status,
      data: null,
      lastSyncedAt: state?.lastSyncedAt ?? null,
      error: mapped.message,
      warnings,
    }
  }

  async function saveStateQuietly(state: SyncState): Promise<void> {
    try {
      await sidecar.setState(state)
    } catch {
      // 保存失败只影响下次同步的效率，不会改动 app-data。
    }
  }

  async function runInternal(
    data: AppData,
    todayKey: string,
    runOptions: RunOptions,
  ): Promise<SyncRunResult> {
    const mode: RunMode = runOptions.mode ?? 'normal'
    const warnings: string[] = []

    const code = await sidecar.getCode().catch(() => null)

    let state: SyncState
    try {
      const loaded = await sidecar.getState()
      if (!loaded) {
        // 有同步码却没有同步状态 = 历史丢失，必须让用户确认，不能猜测。
        if (code) {
          return {
            status: 'needs-confirm',
            data: null,
            lastSyncedAt: null,
            error: '同步状态丢失，请重新确认',
            warnings,
          }
        }
        return {
          status: 'disabled',
          data: null,
          lastSyncedAt: null,
          error: null,
          warnings,
        }
      }
      state = loaded
    } catch (error) {
      return failedResult(null, error, warnings)
    }

    if (!state.enabled || !code) {
      state.status = 'disabled'
      state.lastError = null
      await saveStateQuietly(state)
      return {
        status: 'disabled',
        data: null,
        lastSyncedAt: state.lastSyncedAt,
        error: null,
        warnings,
      }
    }

    if (destructivePending) {
      state.needsReconcile = destructivePending
      state.pending = {}
      destructivePending = null
    }

    if (state.needsReconcile && mode === 'normal') {
      state.status = 'needs-confirm'
      state.lastError = null
      await saveStateQuietly(state)
      return {
        status: 'needs-confirm',
        data: null,
        lastSyncedAt: state.lastSyncedAt,
        error: null,
        warnings,
      }
    }

    if (mode !== 'normal') {
      state.needsReconcile = null
      state.status = 'idle'
    }

    const nextStamp = (): number => {
      const value = Math.max(now(), state.lastStamp + 1)
      state.lastStamp = value
      return value
    }

    if (mode === 'merge' || mode === 'upload') {
      // 用户明确选择“合并/用本机覆盖”：旧 baseline 不再代表当前本机历史。
      state.baseline = {}
      state.pending = {}
    }

    const localCanonical = canonicalRecords(data)
    const localHasData = !isEffectivelyEmpty(data)

    if (mode !== 'cloud') {
      const observed = updatePendingChanges({
        records: localCanonical,
        baseline: state.baseline,
        pending: state.pending,
        nextStamp,
      })
      state.pending = observed.pending
      // 离线时也要把待推送变更留在 sidecar 里。
      await saveStateQuietly(state)
    }

    if (!isOnline()) {
      state.status = 'offline'
      state.lastError = '网络不可用，稍后会自动重试'
      await saveStateQuietly(state)
      return {
        status: 'offline',
        data: null,
        lastSyncedAt: state.lastSyncedAt,
        error: state.lastError,
        warnings,
      }
    }

    state.status = 'syncing'
    state.lastError = null
    await saveStateQuietly(state)

    try {
      // 只有“本机为空”时才需要额外问一次云端是否已有数据，
      // 避免正常同步多消耗一次限流额度。
      let cloudHasData = false
      if (!localHasData && (mode === 'normal' || mode === 'merge')) {
        const server = await transport.status(code)
        cloudHasData = server.hasData || server.liveRecords > 0
      }
      const protect =
        !localHasData &&
        cloudHasData &&
        (mode === 'normal' || mode === 'merge')
      const fullPull = protect || mode === 'cloud' || mode === 'upload'

      const pulled = await pullAll(
        code,
        fullPull ? 0 : state.recordRev,
        fullPull ? 0 : state.imageRev,
        warnings,
      )

      // “空本地不覆盖云端”：只把云端完整拉下来，绝不推送空记录/墓碑。
      if (protect) {
        const records: CanonicalMap = new Map()
        for (const row of pulled.rows) {
          if (row.deleted || !isRecord(row.data)) {
            continue
          }
          records.set(row.key, {
            collection: row.collection,
            id: row.id,
            data: row.data,
          })
        }
        const joined = joinCanonicalRecords(records.values(), todayKey)
        const baseline = baselineFromRows(pulled.rows)
        const changed = !canonicalMapsEqual(data, joined)

        state.baseline = baseline
        state.pending = {}
        state.recordRev = pulled.recordRev
        state.imageRev = pulled.imageRev
        state.status = 'idle'
        state.lastError = null
        state.lastSyncedAt = now()
        state.needsReconcile = null

        await downloadImages(code, joined, pulled.images, state, warnings)
        await saveStateQuietly(state)

        return {
          status: 'idle',
          data: changed ? joined : null,
          lastSyncedAt: state.lastSyncedAt,
          error: null,
          warnings,
        }
      }

      // 以云端为准：完全替换本地。
      if (mode === 'cloud') {
        const records: CanonicalMap = new Map()
        for (const row of pulled.rows) {
          if (row.deleted || !isRecord(row.data)) {
            continue
          }
          records.set(row.key, {
            collection: row.collection,
            id: row.id,
            data: row.data,
          })
        }
        const joined = joinCanonicalRecords(records.values(), todayKey)
        const changed = !canonicalMapsEqual(data, joined)
        const baseline = baselineFromRows(pulled.rows)

        if (changed && localHasData) {
          await capture('before-cloud-restore', data)
        }

        state.baseline = baseline
        state.pending = {}
        state.recordRev = pulled.recordRev
        state.imageRev = pulled.imageRev
        state.status = 'idle'
        state.lastError = null
        state.lastSyncedAt = now()
        state.needsReconcile = null

        await downloadImages(code, joined, pulled.images, state, warnings)
        await saveStateQuietly(state)

        return {
          status: 'idle',
          data: changed ? joined : null,
          lastSyncedAt: state.lastSyncedAt,
          error: null,
          warnings,
        }
      }

      let records: CanonicalMap
      let pending: Record<string, SyncPendingEntry>
      let baseline: Record<string, SyncBaselineEntry>

      if (mode === 'upload') {
        // 用本机覆盖云端：本机全部重新推送，云端多出的非事件记录建墓碑。
        records = new Map(localCanonical)
        for (const row of pulled.rows) {
          if (
            row.collection === 'checkins' &&
            !row.deleted &&
            isRecord(row.data) &&
            !records.has(row.key)
          ) {
            records.set(row.key, {
              collection: row.collection,
              id: row.id,
              data: row.data,
            })
          }
        }

        pending = {}
        baseline = {}
        for (const [key, record] of records) {
          pending[key] = {
            hash: hashRecordData(record.data),
            updatedAt: nextStamp(),
            deleted: false,
          }
        }
        for (const row of pulled.rows) {
          if (row.deleted || row.collection === 'checkins') {
            continue
          }
          if (!records.has(row.key)) {
            pending[row.key] = {
              hash: '',
              updatedAt: nextStamp(),
              deleted: true,
            }
          }
        }
      } else {
        const merged = mergeCloudRecords({
          local: localCanonical,
          pending: state.pending,
          baseline: state.baseline,
          cloud: pulled.rows,
          deviceId: state.deviceId,
          nextStamp,
        })
        records = merged.records
        pending = merged.pending
        baseline = merged.baseline
        warnings.push(...merged.warnings)
      }

      const { changes, dropped } = pendingChanges(pending, records)
      for (const key of dropped) {
        delete pending[key]
      }

      // isEmpty 只在“本机有数据”时为 false；显式选择“用本机覆盖云端”
      // 时允许空本机提交墓碑，因为用户已在二次确认里确认过。
      const isEmpty = mode === 'upload' ? false : !localHasData
      let pushedCount = 0
      let acceptedCount = 0
      if (changes.length > 0 && (localHasData || mode === 'upload')) {
        for (
          let index = 0;
          index < changes.length;
          index += SYNC.maxRecordsPerPush
        ) {
          const batch = changes.slice(
            index,
            index + SYNC.maxRecordsPerPush,
          )
          const result = await transport.push(code, {
            deviceId: state.deviceId,
            isEmpty,
            changes: batch,
          })
          pushedCount += batch.length
          acceptedCount += result.accepted
          for (const change of batch) {
            const entry = pending[change.key]
            if (!entry) {
              continue
            }
            if (entry.deleted) {
              delete pending[change.key]
              delete baseline[change.key]
            } else {
              baseline[change.key] = {
                hash: entry.hash,
                updatedAt: entry.updatedAt,
                deviceId: state.deviceId,
                rev: result.rev,
              }
              delete pending[change.key]
            }
          }
        }
      }

      let joined = joinCanonicalRecords(
        liveRecords(records, pending),
        todayKey,
      )

      if (localHasData) {
        await uploadImages(code, joined, state, nextStamp, warnings)
      }

      // 只有服务端可能拒绝了部分写入时才再拉一轮收敛；
      // 全部接受时游标停在本轮 pull 的末端，自己的写入下次会自然拉回。
      let recordRev = pulled.recordRev
      let imageRev = pulled.imageRev
      let imageMetas = pulled.images
      if (pushedCount > 0 && acceptedCount < pushedCount) {
        const convergence = await pullAll(
          code,
          pulled.recordRev,
          pulled.imageRev,
          warnings,
        )
        recordRev = convergence.recordRev
        imageRev = convergence.imageRev
        imageMetas = [...pulled.images, ...convergence.images]
        if (convergence.rows.length > 0) {
          const merged = mergeCloudRecords({
            local: records,
            pending,
            baseline,
            cloud: convergence.rows,
            deviceId: state.deviceId,
            nextStamp,
          })
          records = merged.records
          pending = merged.pending
          baseline = merged.baseline
          warnings.push(...merged.warnings)
        }
      }

      joined = joinCanonicalRecords(
        liveRecords(records, pending),
        todayKey,
      )
      const changed = !canonicalMapsEqual(data, joined)

      if (changed && localHasData) {
        await capture('before-cloud-merge', data)
      }

      state.baseline = baseline
      state.pending = pending
      state.recordRev = recordRev
      state.imageRev = imageRev
      state.status = 'idle'
      state.lastError = null
      state.lastSyncedAt = now()
      state.needsReconcile = null

      await downloadImages(code, joined, imageMetas, state, warnings)
      await saveStateQuietly(state)

      return {
        status: 'idle',
        data: changed ? joined : null,
        lastSyncedAt: state.lastSyncedAt,
        error: null,
        warnings,
      }
    } catch (error) {
      const result = failedResult(state, error, warnings)
      await saveStateQuietly(state)
      return result
    }
  }

  return {
    async getView(): Promise<SyncView> {
      const code = await sidecar.getCode().catch(() => null)
      let state: SyncState | null
      try {
        state = await sidecar.getState()
      } catch (error) {
        return {
          enabled: false,
          code,
          status: 'needs-confirm',
          lastSyncedAt: null,
          lastError:
            error instanceof SyncStateCorruptError
              ? '同步状态损坏，需要重新连接'
              : '无法读取同步状态',
          needsReconcile: null,
          deviceId: null,
        }
      }

      if (!state && code) {
        // 同步码还在但历史丢了：保留码，要求用户确认合并方向。
        return {
          enabled: false,
          code,
          status: 'needs-confirm',
          lastSyncedAt: null,
          lastError: '同步状态丢失，请重新确认',
          needsReconcile: 'recovery',
          deviceId: null,
        }
      }

      return {
        enabled: state?.enabled === true,
        code,
        status: destructivePending
          ? 'needs-confirm'
          : state?.status ?? 'disabled',
        lastSyncedAt: state?.lastSyncedAt ?? null,
        lastError: state?.lastError ?? null,
        needsReconcile: destructivePending ?? state?.needsReconcile ?? null,
        deviceId: state?.deviceId ?? null,
      }
    },

    async enable(): Promise<EnableResult> {
      return enqueue(() =>
        withTabLock(async () => {
          try {
            const existingCode = await sidecar.getCode()
            const existingState = await safeGetState()

            if (existingCode) {
              if (existingState?.enabled) {
                return { code: existingCode, error: null }
              }
              await attach(existingCode, {
                lostHistory: existingState === null,
              })
              return { code: existingCode, error: null }
            }

            const code = generateSyncCode()
            const codeHash = await hashSyncCode(code)
            if (!codeHash) {
              return { code: null, error: '无法生成同步码' }
            }
            await transport.register(codeHash)
            await attach(code)
            return { code, error: null }
          } catch (error) {
            return { code: null, error: describeError(error).message }
          }
        }),
      )
    },

    async connect(
      codeInput: string,
      data: AppData,
      todayKey: string,
    ): Promise<ConnectResult> {
      return enqueue(() =>
        withTabLock(async () => {
          const localHasData = !isEffectivelyEmpty(data)
          const code = normalizeSyncCode(codeInput)
          if (!code) {
            return {
              status: 'auth-failed',
              data: null,
              code: null,
              cloudHasData: false,
              localHasData,
              error: '同步码格式不正确',
            }
          }

          let server
          try {
            server = await transport.status(code)
          } catch (error) {
            const mapped = describeError(error)
            return {
              status: mapped.status,
              data: null,
              code: null,
              cloudHasData: false,
              localHasData,
              error: mapped.message,
            }
          }

          const cloudHasData = server.hasData || server.liveRecords > 0

          if (!cloudHasData) {
            if (!localHasData) {
              await attach(code)
              return {
                status: 'idle',
                data: null,
                code,
                cloudHasData: false,
                localHasData: false,
                error: null,
              }
            }
            // 等用户确认“上传本机数据”后才保存同步码。
            pendingConnect = code
            return {
              status: 'needs-upload',
              data: null,
              code,
              cloudHasData: false,
              localHasData: true,
              error: null,
            }
          }

          if (!localHasData) {
            await attach(code)
            const result = await runInternal(data, todayKey, {
              mode: 'normal',
            })
            return {
              status: result.status,
              data: result.data,
              code,
              cloudHasData: true,
              localHasData: false,
              error: result.error,
            }
          }

          // 两边都有数据：不写任何本地数据，等用户选择。
          pendingConnect = code
          return {
            status: 'needs-choice',
            data: null,
            code,
            cloudHasData: true,
            localHasData: true,
            error: null,
          }
        }),
      )
    },

    async choose(
      kind: ConnectChoice,
      data: AppData,
      todayKey: string,
    ): Promise<SyncRunResult> {
      return enqueue(() =>
        withTabLock(async () => {
          let code = await sidecar.getCode().catch(() => null)
          if (!code) {
            code = pendingConnect
          }
          if (!code) {
            return {
              status: 'auth-failed',
              data: null,
              lastSyncedAt: null,
              error: '请先输入同步码',
              warnings: [],
            }
          }

          const existingState = await safeGetState()
          if (!existingState || (await sidecar.getCode()) !== code) {
            await attach(code)
          }
          pendingConnect = null

          const state = await safeGetState()
          if (state) {
            state.needsReconcile = null
            state.status = 'idle'
            state.lastError = null
            await saveStateQuietly(state)
          }

          return runInternal(data, todayKey, { mode: kind })
        }),
      )
    },

    async sync(data: AppData, todayKey: string): Promise<SyncRunResult> {
      return enqueue(() =>
        withTabLock(() => runInternal(data, todayKey, { mode: 'normal' })),
      )
    },

    async rotate(): Promise<RotateResult> {
      return enqueue(() =>
        withTabLock(async () => {
          try {
            const state = await safeGetState()
            const code = await sidecar.getCode()
            if (!state || !code) {
              return { code: null, error: '尚未开启云同步' }
            }

            const newCode = generateSyncCode()
            const newCodeHash = await hashSyncCode(newCode)
            if (!newCodeHash) {
              return { code: null, error: '无法生成新的同步码' }
            }

            await transport.rotate(code, newCodeHash)
            await sidecar.setCode(newCode)
            state.lastError = null
            state.status = 'idle'
            await sidecar.setState(state)
            return { code: newCode, error: null }
          } catch (error) {
            return { code: null, error: describeError(error).message }
          }
        }),
      )
    },

    async disable(): Promise<void> {
      await enqueue(() =>
        withTabLock(async () => {
          const state = await safeGetState()
          if (!state) {
            return
          }
          // 只暂停自动同步：保留同步码、baseline/pending 和全部本地数据。
          state.enabled = false
          state.status = 'disabled'
          state.lastError = null
          await saveStateQuietly(state)
        }),
      )
    },

    async forget(): Promise<void> {
      await enqueue(() =>
        withTabLock(async () => {
          pendingConnect = null
          destructivePending = null
          await sidecar.removeCode().catch(() => undefined)
          await sidecar.removeState().catch(() => undefined)
        }),
      )
    },

    dispose(): void {
      disposeDestructive()
    },
  }
}
