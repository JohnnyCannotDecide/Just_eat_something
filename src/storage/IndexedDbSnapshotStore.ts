import { PROD_SNAPSHOT_DB_NAME } from './namespaces'
import type {
  SnapshotMeta,
  SnapshotPayload,
  SnapshotStore,
} from './SnapshotStore'

export const SNAPSHOT_META_STORE_NAME = 'meta'
export const SNAPSHOT_PAYLOAD_STORE_NAME = 'payloads'
const DB_VERSION = 1

const OPEN_ERROR = '本地快照存储不可用，请检查浏览器是否允许本地存储'
const WRITE_ERROR = '本地快照保存失败，可能是存储空间不足'

/**
 * 全量快照：元数据与 payload 分 store，列表只读 meta，恢复时才加载图片。
 * 独立 DB 避免和图片库的版本升级互相阻塞。
 */
export class IndexedDbSnapshotStore implements SnapshotStore {
  private dbPromise: Promise<IDBDatabase> | null = null
  private readonly factory: IDBFactory | undefined
  private readonly dbName: string

  constructor(
    factory: IDBFactory | undefined = globalThis.indexedDB,
    dbName: string = PROD_SNAPSHOT_DB_NAME,
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
        if (!db.objectStoreNames.contains(SNAPSHOT_META_STORE_NAME)) {
          db.createObjectStore(SNAPSHOT_META_STORE_NAME, { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains(SNAPSHOT_PAYLOAD_STORE_NAME)) {
          db.createObjectStore(SNAPSHOT_PAYLOAD_STORE_NAME, { keyPath: 'id' })
        }
      }
      request.onsuccess = () => {
        const db = request.result
        db.onversionchange = () => db.close()
        resolve(db)
      }
      request.onerror = () => reject(new Error(OPEN_ERROR))
      request.onblocked = () => reject(new Error(OPEN_ERROR))
    })

    this.dbPromise = promise
    promise.catch(() => {
      this.dbPromise = null
    })
    return promise
  }

  private async read<T>(
    storeNames: string | string[],
    make: (transaction: IDBTransaction) => IDBRequest,
    map: (value: unknown) => T,
  ): Promise<T> {
    const db = await this.open()

    return new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(storeNames, 'readonly')
      const request = make(transaction)
      request.onsuccess = () => resolve(map(request.result))
      request.onerror = () => reject(new Error(WRITE_ERROR))
      transaction.onabort = () => reject(new Error(WRITE_ERROR))
    })
  }

  private async write(
    make: (transaction: IDBTransaction) => void,
  ): Promise<void> {
    const db = await this.open()

    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(
        [SNAPSHOT_META_STORE_NAME, SNAPSHOT_PAYLOAD_STORE_NAME],
        'readwrite',
      )
      try {
        make(transaction)
      } catch {
        transaction.abort()
        reject(new Error(WRITE_ERROR))
        return
      }
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(new Error(WRITE_ERROR))
      transaction.onabort = () => reject(new Error(WRITE_ERROR))
    })
  }

  async put(meta: SnapshotMeta, payload: SnapshotPayload): Promise<void> {
    await this.write((transaction) => {
      transaction.objectStore(SNAPSHOT_META_STORE_NAME).put(meta)
      transaction.objectStore(SNAPSHOT_PAYLOAD_STORE_NAME).put(payload)
    })
  }

  async list(): Promise<SnapshotMeta[]> {
    return this.read(
      SNAPSHOT_META_STORE_NAME,
      (transaction) =>
        transaction.objectStore(SNAPSHOT_META_STORE_NAME).getAll(),
      (value) => {
        if (!Array.isArray(value)) {
          return []
        }
        return (value as SnapshotMeta[]).sort((left, right) => {
          if (right.createdAt !== left.createdAt) {
            return right.createdAt - left.createdAt
          }
          return right.id.localeCompare(left.id)
        })
      },
    )
  }

  async get(id: string): Promise<SnapshotPayload | null> {
    const value = await this.read<unknown>(
      SNAPSHOT_PAYLOAD_STORE_NAME,
      (transaction) =>
        transaction.objectStore(SNAPSHOT_PAYLOAD_STORE_NAME).get(id),
      (result) => result,
    )
    if (!value || typeof value !== 'object') {
      return null
    }
    const payload = value as SnapshotPayload
    return Array.isArray(payload.images)
      ? payload
      : { ...payload, images: [] }
  }

  async remove(id: string): Promise<void> {
    await this.write((transaction) => {
      transaction.objectStore(SNAPSHOT_META_STORE_NAME).delete(id)
      transaction.objectStore(SNAPSHOT_PAYLOAD_STORE_NAME).delete(id)
    })
  }

  async prune(keepIds: readonly string[]): Promise<void> {
    const keep = new Set(keepIds)
    const snapshots = await this.list()
    const removeIds = snapshots
      .map((snapshot) => snapshot.id)
      .filter((id) => !keep.has(id))
    if (removeIds.length === 0) {
      return
    }

    await this.write((transaction) => {
      const meta = transaction.objectStore(SNAPSHOT_META_STORE_NAME)
      const payloads = transaction.objectStore(SNAPSHOT_PAYLOAD_STORE_NAME)
      for (const id of removeIds) {
        meta.delete(id)
        payloads.delete(id)
      }
    })
  }
}
