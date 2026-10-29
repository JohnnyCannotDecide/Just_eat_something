import type {
  BinaryStorageAdapter,
  StoredImage,
  StoredImageEntry,
} from './BinaryStorageAdapter'
import type { StorageAdapter } from './StorageAdapter'

const NOT_IMPLEMENTED = 'CloudSyncAdapter 尚未实现'

/**
 * 云端同步的占位实现：JSON 与图片接口都明确失败。
 * 图片方法绝不能返回 null，否则会静默丢图。
 */
export class CloudSyncAdapter
  implements StorageAdapter, BinaryStorageAdapter
{
  async get<T>(_key: string): Promise<T | null> {
    throw new Error(NOT_IMPLEMENTED)
  }

  async set<T>(_key: string, _value: T): Promise<void> {
    throw new Error(NOT_IMPLEMENTED)
  }

  async getRaw(_key: string): Promise<string | null> {
    throw new Error(NOT_IMPLEMENTED)
  }

  async setRaw(_key: string, _raw: string): Promise<void> {
    throw new Error(NOT_IMPLEMENTED)
  }

  async remove(_key: string): Promise<void> {
    throw new Error(NOT_IMPLEMENTED)
  }

  async exportAll(): Promise<Record<string, unknown>> {
    throw new Error(NOT_IMPLEMENTED)
  }

  async getImage(_key: string): Promise<StoredImage | null> {
    throw new Error(NOT_IMPLEMENTED)
  }

  async putImage(_key: string, _image: StoredImage): Promise<void> {
    throw new Error(NOT_IMPLEMENTED)
  }

  async listImages(): Promise<StoredImageEntry[]> {
    throw new Error(NOT_IMPLEMENTED)
  }

  async putImages(_entries: readonly StoredImageEntry[]): Promise<void> {
    throw new Error(NOT_IMPLEMENTED)
  }

  async deleteImage(_key: string): Promise<void> {
    throw new Error(NOT_IMPLEMENTED)
  }

  async clearImages(): Promise<void> {
    throw new Error(NOT_IMPLEMENTED)
  }
}
