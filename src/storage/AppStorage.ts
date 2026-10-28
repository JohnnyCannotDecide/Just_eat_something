import type {
  BinaryStorageAdapter,
  StoredImage,
} from './BinaryStorageAdapter'
import type { StorageAdapter } from './StorageAdapter'
import { IndexedDbImageStore } from './IndexedDbImageStore'
import { LocalStorageAdapter } from './LocalStorageAdapter'

/**
 * 业务侧唯一的存储门面：JSON 走 localStorage，图片走 IndexedDB。
 * 换实现（云端、测试假实现）时只替换构造参数。
 */
export class AppStorage implements StorageAdapter, BinaryStorageAdapter {
  private readonly json: StorageAdapter
  private readonly images: BinaryStorageAdapter

  constructor(
    json: StorageAdapter = new LocalStorageAdapter(),
    images: BinaryStorageAdapter = new IndexedDbImageStore(),
  ) {
    this.json = json
    this.images = images
  }

  get<T>(key: string): Promise<T | null> {
    return this.json.get<T>(key)
  }

  set<T>(key: string, value: T): Promise<void> {
    return this.json.set(key, value)
  }

  remove(key: string): Promise<void> {
    return this.json.remove(key)
  }

  exportAll(): Promise<Record<string, unknown>> {
    return this.json.exportAll()
  }

  getImage(key: string): Promise<StoredImage | null> {
    return this.images.getImage(key)
  }

  putImage(key: string, image: StoredImage): Promise<void> {
    return this.images.putImage(key, image)
  }

  deleteImage(key: string): Promise<void> {
    return this.images.deleteImage(key)
  }

  clearImages(): Promise<void> {
    return this.images.clearImages()
  }
}
