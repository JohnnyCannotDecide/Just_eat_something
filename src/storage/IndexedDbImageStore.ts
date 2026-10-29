import type {
  BinaryStorageAdapter,
  ImageMime,
  StoredImage,
  StoredImageEntry,
} from './BinaryStorageAdapter'
import { PROD_IMAGE_DB_NAME } from './namespaces'

export const IMAGE_DB_NAME = PROD_IMAGE_DB_NAME
export const IMAGE_STORE_NAME = 'images'
const DB_VERSION = 1

const OPEN_ERROR = '图片存储不可用，请检查浏览器是否允许本地存储'
const WRITE_ERROR = '图片保存失败，可能是存储空间不足'

interface ImageRecord {
  key: string
  mime: ImageMime
  bytes: Uint8Array
  updatedAt: number
}

function isArrayBuffer(value: unknown): value is ArrayBuffer {
  return (
    value instanceof ArrayBuffer ||
    Object.prototype.toString.call(value) === '[object ArrayBuffer]'
  )
}

/**
 * 跨 realm 取字节：测试环境（jsdom）与页面里得到的是不同 realm 的
 * Uint8Array，`instanceof` 会失效，所以这里按视图/ArrayBuffer 判断。
 */
function toBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) {
    return value
  }
  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
  }
  if (isArrayBuffer(value)) {
    return new Uint8Array(value)
  }
  return new Uint8Array(0)
}

function toEntry(value: unknown): StoredImageEntry | null {
  const record = value as ImageRecord | undefined
  if (
    !record ||
    typeof record.key !== 'string' ||
    typeof record.mime !== 'string'
  ) {
    return null
  }
  return {
    imageId: record.key,
    mime: record.mime,
    bytes: toBytes(record.bytes),
  }
}

/**
 * 自制菜图片的落盘实现：IndexedDB，只把 key / mime / 字节存下来。
 * 业务代码通过 BinaryStorageAdapter 访问，不直接碰 indexedDB。
 */
export class IndexedDbImageStore implements BinaryStorageAdapter {
  private dbPromise: Promise<IDBDatabase> | null = null
  private readonly factory: IDBFactory | undefined
  private readonly dbName: string

  constructor(
    factory: IDBFactory | undefined = globalThis.indexedDB,
    dbName: string = IMAGE_DB_NAME,
  ) {
    this.factory = factory
    this.dbName = dbName
  }

  private open(): Promise<IDBDatabase> {
    if (this.dbPromise) {
      return this.dbPromise
    }

    const promise = new Promise<IDBDatabase>((resolve, reject) => {
      if (!this.factory) {
        reject(new Error(OPEN_ERROR))
        return
      }

      let request: IDBOpenDBRequest
      try {
        request = this.factory.open(this.dbName, DB_VERSION)
      } catch {
        reject(new Error(OPEN_ERROR))
        return
      }

      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(IMAGE_STORE_NAME)) {
          db.createObjectStore(IMAGE_STORE_NAME, { keyPath: 'key' })
        }
      }
      request.onsuccess = () => {
        const db = request.result
        // 别的标签页升级版本时主动让路，避免卡住对方。
        db.onversionchange = () => db.close()
        resolve(db)
      }
      request.onerror = () => reject(new Error(OPEN_ERROR))
      request.onblocked = () => reject(new Error(OPEN_ERROR))
    })

    this.dbPromise = promise
    promise.catch(() => {
      // 打开失败不缓存，下次调用可以重试。
      this.dbPromise = null
    })
    return promise
  }

  private async read<T>(
    make: (store: IDBObjectStore) => IDBRequest,
    map: (value: unknown) => T,
  ): Promise<T> {
    const db = await this.open()

    return new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(IMAGE_STORE_NAME, 'readonly')
      const request = make(transaction.objectStore(IMAGE_STORE_NAME))
      request.onsuccess = () => resolve(map(request.result))
      request.onerror = () => reject(new Error(WRITE_ERROR))
    })
  }

  private async write(
    make: (store: IDBObjectStore) => void,
  ): Promise<void> {
    const db = await this.open()

    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(IMAGE_STORE_NAME, 'readwrite')
      try {
        make(transaction.objectStore(IMAGE_STORE_NAME))
      } catch {
        // 批量写入中途出错时必须显式 abort，否则已排队的 put 仍会提交，
        // 留下“只写了一半”的图片。
        try {
          transaction.abort()
        } catch {
          // 事务可能已经结束，忽略。
        }
        reject(new Error(WRITE_ERROR))
        return
      }
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(new Error(WRITE_ERROR))
      transaction.onabort = () => reject(new Error(WRITE_ERROR))
    })
  }

  async getImage(key: string): Promise<StoredImage | null> {
    return this.read(
      (store) => store.get(key),
      (value) => {
        const record = value as ImageRecord | undefined
        if (!record || typeof record.mime !== 'string') {
          return null
        }
        return { mime: record.mime, bytes: toBytes(record.bytes) }
      },
    )
  }

  async putImage(key: string, image: StoredImage): Promise<void> {
    await this.write((store) => {
      const record: ImageRecord = {
        key,
        mime: image.mime,
        bytes: toBytes(image.bytes),
        updatedAt: Date.now(),
      }
      store.put(record)
    })
  }

  async listImages(): Promise<StoredImageEntry[]> {
    return this.read(
      (store) => store.getAll(),
      (value) => {
        if (!Array.isArray(value)) {
          return []
        }
        return value
          .map(toEntry)
          .filter((entry): entry is StoredImageEntry => entry !== null)
      },
    )
  }

  async putImages(entries: readonly StoredImageEntry[]): Promise<void> {
    if (entries.length === 0) {
      return
    }
    await this.write((store) => {
      const updatedAt = Date.now()
      for (const entry of entries) {
        const record: ImageRecord = {
          key: entry.imageId,
          mime: entry.mime,
          bytes: toBytes(entry.bytes),
          updatedAt,
        }
        store.put(record)
      }
    })
  }

  async deleteImage(key: string): Promise<void> {
    await this.write((store) => {
      store.delete(key)
    })
  }

  async clearImages(): Promise<void> {
    await this.write((store) => {
      store.clear()
    })
  }
}
