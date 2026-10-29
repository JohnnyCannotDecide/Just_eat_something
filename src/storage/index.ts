import { AppStorage } from './AppStorage'
import { IndexedDbImageStore } from './IndexedDbImageStore'
import { IndexedDbSnapshotStore } from './IndexedDbSnapshotStore'
import { LocalStorageAdapter } from './LocalStorageAdapter'
import {
  PROD_IMAGE_DB_NAME,
  PROD_SNAPSHOT_DB_NAME,
  PROD_STORAGE_PREFIX,
} from './namespaces'
import { createSnapshotService } from './snapshots'

export type { StorageAdapter } from './StorageAdapter'
export type {
  BinaryStorageAdapter,
  ImageMime,
  StoredImage,
  StoredImageEntry,
} from './BinaryStorageAdapter'
export { IMAGE_MIMES, isImageMime } from './BinaryStorageAdapter'
export { AppStorage } from './AppStorage'
export {
  IndexedDbImageStore,
  IMAGE_DB_NAME,
  IMAGE_STORE_NAME,
} from './IndexedDbImageStore'
export { LocalStorageAdapter, DEFAULT_KEY_PREFIX } from './LocalStorageAdapter'
export { CloudSyncAdapter } from './CloudSyncAdapter'
export {
  DEV_IMAGE_DB_NAME,
  DEV_SNAPSHOT_DB_NAME,
  DEV_STORAGE_PREFIX,
  PROD_IMAGE_DB_NAME,
  PROD_SNAPSHOT_DB_NAME,
  PROD_STORAGE_PREFIX,
  TEST_IMAGE_DB_NAME,
  TEST_SNAPSHOT_DB_NAME,
  TEST_STORAGE_PREFIX,
  dataTransferLockName,
  imageDbName,
  snapshotDbName,
  storagePrefix,
} from './namespaces'
export type { StorageNamespace } from './namespaces'
export * from './SnapshotStore'
export {
  IndexedDbSnapshotStore,
  SNAPSHOT_META_STORE_NAME,
  SNAPSHOT_PAYLOAD_STORE_NAME,
} from './IndexedDbSnapshotStore'
export * from './snapshots'
export * from './appData'
export * from './backup'

/** 业务代码统一通过这个单例访问存储，不要直接调用 localStorage / IndexedDB。 */
export const storage: AppStorage = new AppStorage(
  new LocalStorageAdapter(PROD_STORAGE_PREFIX),
  new IndexedDbImageStore(undefined, PROD_IMAGE_DB_NAME),
)

/** 图片端口别名：组件需要读图时用它，语义更直白。 */
export const imageStorage: AppStorage = storage

/** 本地全量快照；独立 IndexedDB，清空图片不会误删快照。 */
export const snapshotStore: IndexedDbSnapshotStore = new IndexedDbSnapshotStore(
  undefined,
  PROD_SNAPSHOT_DB_NAME,
)

export const snapshotService = createSnapshotService({
  store: snapshotStore,
  adapter: storage,
  imageAdapter: storage,
})
