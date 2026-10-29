import type { StoredImageEntry } from './BinaryStorageAdapter'

export type SnapshotReason =
  | 'migration'
  | 'before-clear'
  | 'before-import'
  | 'before-restore'
  | 'before-clear-profile'
  | 'before-recovery'

/** 列表只读元数据，避免为了显示时间/大小去加载全部图片字节。 */
export interface SnapshotMeta {
  id: string
  createdAt: number
  reason: SnapshotReason
  appSchemaVersion: number | null
  sizeBytes: number
  imageCount: number
}

export interface SnapshotPayload {
  id: string
  raw: string | null
  images: StoredImageEntry[]
}

export interface SnapshotStore {
  put(meta: SnapshotMeta, payload: SnapshotPayload): Promise<void>
  list(): Promise<SnapshotMeta[]>
  get(id: string): Promise<SnapshotPayload | null>
  remove(id: string): Promise<void>
  prune(keepIds: readonly string[]): Promise<void>
}
