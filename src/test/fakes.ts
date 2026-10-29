import type {
  BinaryStorageAdapter,
  StoredImage,
  StoredImageEntry,
} from '@/storage/BinaryStorageAdapter'
import type {
  SnapshotMeta,
  SnapshotPayload,
  SnapshotStore,
} from '@/storage/SnapshotStore'
import { createSnapshotService } from '@/storage/snapshots'
import type { SnapshotService } from '@/storage/snapshots'
import type { StorageAdapter } from '@/storage/StorageAdapter'

export interface MemoryImages
  extends BinaryStorageAdapter {
  images: Map<string, StoredImage>
}

/** 内存图片库。putImages 模拟单事务：中途失败整批不写入。 */
export function createMemoryImages(
  initial: ReadonlyArray<StoredImageEntry> = [],
): MemoryImages {
  const images = new Map<string, StoredImage>()
  for (const { imageId, ...image } of initial) {
    images.set(imageId, image)
  }

  return {
    images,
    getImage: async (key) => images.get(key) ?? null,
    putImage: async (key, image) => {
      images.set(key, image)
    },
    listImages: async () =>
      [...images.entries()].map(([imageId, image]) => ({ imageId, ...image })),
    putImages: async (entries) => {
      for (const { imageId, ...image } of entries) {
        images.set(imageId, image)
      }
    },
    deleteImage: async (key) => {
      images.delete(key)
    },
    clearImages: async () => {
      images.clear()
    },
  }
}

export interface MemorySnapshotStore extends SnapshotStore {
  metas: Map<string, SnapshotMeta>
  payloads: Map<string, SnapshotPayload>
}

/** 内存快照库；list 按 createdAt 倒序，与 IndexedDB 实现一致。 */
export function createMemorySnapshotStore(): MemorySnapshotStore {
  const metas = new Map<string, SnapshotMeta>()
  const payloads = new Map<string, SnapshotPayload>()

  return {
    metas,
    payloads,
    async put(meta, payload) {
      metas.set(meta.id, { ...meta })
      payloads.set(meta.id, {
        ...payload,
        images: payload.images.map((image) => ({ ...image })),
      })
    },
    async list() {
      return [...metas.values()]
        .slice()
        .sort((a, b) =>
          b.createdAt === a.createdAt
            ? b.id.localeCompare(a.id)
            : b.createdAt - a.createdAt,
        )
        .map((meta) => ({ ...meta }))
    },
    async get(id) {
      return payloads.get(id) ?? null
    },
    async remove(id) {
      metas.delete(id)
      payloads.delete(id)
    },
    async prune(keepIds) {
      const keep = new Set(keepIds)
      for (const id of [...metas.keys()]) {
        if (!keep.has(id)) {
          metas.delete(id)
          payloads.delete(id)
        }
      }
    },
  }
}

export interface MemorySnapshots extends SnapshotService {
  store: MemorySnapshotStore
  /** 设为 true 后 capture 抛错，用于验证破坏性操作 fail-closed。 */
  failCapture: boolean
}

export function createMemorySnapshots(options: {
  adapter: StorageAdapter
  images?: BinaryStorageAdapter
  now?: () => number
  maxSnapshots?: number
}): MemorySnapshots {
  const store = createMemorySnapshotStore()
  const service = createSnapshotService({
    store,
    adapter: options.adapter,
    imageAdapter: options.images ?? createMemoryImages(),
    now: options.now,
    maxSnapshots: options.maxSnapshots,
  })

  const memory: MemorySnapshots = {
    store,
    failCapture: false,
    async capture(input) {
      if (memory.failCapture) {
        throw new Error('快照失败（测试）')
      }
      return service.capture(input)
    },
    list: () => service.list(),
    read: (id) => service.read(id),
    remove: (id) => service.remove(id),
  }
  return memory
}
