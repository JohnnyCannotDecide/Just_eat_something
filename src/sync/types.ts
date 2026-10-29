import type { ImageMime } from '@/storage/BinaryStorageAdapter'
import type { AppData } from '@/storage/appData'

/** 同步总状态；UI 直接镜像这些值。 */
export type SyncRunStatus =
  | 'disabled'
  | 'idle'
  | 'syncing'
  | 'offline'
  | 'error'
  | 'auth-failed'
  | 'needs-choice'
  | 'needs-confirm'

export type DestructiveKind = 'clear' | 'import' | 'restore' | 'recovery'

export interface SyncBaselineEntry {
  hash: string
  updatedAt: number
  deviceId: string
  rev: number
}

export interface SyncPendingEntry {
  hash: string
  updatedAt: number
  deleted: boolean
}

export interface SyncImageEntry {
  hash: string
  updatedAt: number
}

/**
 * 独立于 app-data 的同步元数据。记录只有出现在 baseline / pending 里才
 * 有本地时间语义；sidecar 丢失时引擎不会猜测，会要求用户确认。
 */
export interface SyncState {
  version: 1
  enabled: boolean
  deviceId: string
  recordRev: number
  imageRev: number
  lastSyncedAt: number | null
  /** 本地编辑时间戳的 Lamport 下界。 */
  lastStamp: number
  status: SyncRunStatus
  lastError: string | null
  /** 清空/导入/恢复后置位；用户做出选择前不自动同步。 */
  needsReconcile: DestructiveKind | null
  baseline: Record<string, SyncBaselineEntry>
  pending: Record<string, SyncPendingEntry>
  images: Record<string, SyncImageEntry>
  imageWarnings: string[]
}

export function createEmptySyncState(
  deviceId: string,
  now = Date.now(),
): SyncState {
  return {
    version: 1,
    enabled: false,
    deviceId,
    recordRev: 0,
    imageRev: 0,
    lastSyncedAt: null,
    lastStamp: now,
    status: 'disabled',
    lastError: null,
    needsReconcile: null,
    baseline: {},
    pending: {},
    images: {},
    imageWarnings: [],
  }
}

export const SYNC_STATE_VERSION = 1

export class SyncStateCorruptError extends Error {
  readonly backupKey: string

  constructor(backupKey: string) {
    super('同步状态已损坏，需要重新确认')
    this.name = 'SyncStateCorruptError'
    this.backupKey = backupKey
  }
}

export interface SyncSidecar {
  getCode(): Promise<string | null>
  setCode(code: string): Promise<void>
  removeCode(): Promise<void>
  getState(): Promise<SyncState | null>
  setState(state: SyncState): Promise<void>
  removeState(): Promise<void>
}

export interface CloudRecordRow {
  key: string
  collection: string
  id: string
  json: string
  updatedAt: number
  deviceId: string
  deleted: boolean
  rev: number
}

export interface CloudImageMeta {
  id: string
  mime: string
  updatedAt: number
  deleted: boolean
  rev: number
}

export interface CloudImageData {
  id: string
  mime: string
  data: string
  updatedAt: number
  rev: number
}

export interface PullResult {
  records: CloudRecordRow[]
  images: CloudImageMeta[]
  recordRev: number
  imageRev: number
  hasMoreRecords: boolean
  hasMoreImages: boolean
}

export interface PushChange {
  key: string
  json?: string
  updatedAt: number
  deleted: boolean
}

export interface PushRequest {
  deviceId: string
  isEmpty: boolean
  changes: PushChange[]
}

export interface PushResult {
  rev: number
  accepted: number
}

export interface CloudImageUpload {
  id: string
  mime: ImageMime
  base64: string
  updatedAt: number
}

export interface ServerStatus {
  rev: number
  liveRecords: number
  hasData: boolean
  lastUpdatedAt: number | null
}

export interface SyncView {
  enabled: boolean
  code: string | null
  status: SyncRunStatus
  lastSyncedAt: number | null
  lastError: string | null
  needsReconcile: DestructiveKind | null
  deviceId: string | null
}

export interface SyncRunResult {
  status: SyncRunStatus
  /** 需要写回 store 的新数据；null 表示本地无需变化。 */
  data: AppData | null
  lastSyncedAt: number | null
  error: string | null
  warnings: string[]
}

export type ConnectChoice = 'merge' | 'cloud' | 'upload'

export interface ConnectInspection {
  code: string
  codeHash: string
  cloudHasData: boolean
  localHasData: boolean
  status: 'ready' | 'needs-choice' | 'needs-upload' | 'auth-failed'
}

export interface ConnectResult {
  status: SyncRunStatus | 'needs-upload'
  data: AppData | null
  code: string | null
  cloudHasData: boolean
  localHasData: boolean
  error: string | null
}
