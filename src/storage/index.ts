import { AppStorage } from './AppStorage'

export type { StorageAdapter } from './StorageAdapter'
export type {
  BinaryStorageAdapter,
  ImageMime,
  StoredImage,
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
export * from './appData'
export * from './backup'

/** 业务代码统一通过这个单例访问存储，不要直接调用 localStorage / IndexedDB。 */
export const storage: AppStorage = new AppStorage()

/** 图片端口别名：组件需要读图时用它，语义更直白。 */
export const imageStorage: AppStorage = storage
