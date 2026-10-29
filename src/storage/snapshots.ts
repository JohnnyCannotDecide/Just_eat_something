import type {
  BinaryStorageAdapter,
  StoredImageEntry,
} from './BinaryStorageAdapter'
import type { StorageAdapter } from './StorageAdapter'
import type { AppData } from './appData'
import { APP_DATA_STORAGE_KEY, serializeAppData } from './appData'
import { collectReferencedImageIds } from './backup'
import type {
  SnapshotMeta,
  SnapshotPayload,
  SnapshotReason,
  SnapshotStore,
} from './SnapshotStore'

export interface SnapshotService {
  capture(input: {
    reason: SnapshotReason
    data: AppData | null
    /** 传入已知 raw 可避免重复读；null 表示明确没有 app-data。 */
    raw?: string | null
  }): Promise<SnapshotMeta>
  list(): Promise<SnapshotMeta[]>
  read(id: string): Promise<SnapshotPayload | null>
  remove(id: string): Promise<void>
}

export interface CreateSnapshotServiceOptions {
  store: SnapshotStore
  adapter: StorageAdapter
  imageAdapter: BinaryStorageAdapter
  now?: () => number
  idFactory?: () => string
  /** 默认 10 份。 */
  maxSnapshots?: number
}

let fallbackId = 0

function defaultIdFactory(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID()
  }
  fallbackId += 1
  return `snapshot-${Date.now()}-${fallbackId}`
}

function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length
}

function readSchemaVersion(raw: string | null): number | null {
  if (raw === null) {
    return null
  }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return null
    }
    const version = (parsed as { schemaVersion?: unknown }).schemaVersion
    return typeof version === 'number' && Number.isInteger(version)
      ? version
      : null
  } catch {
    return null
  }
}

export function createSnapshotService(
  options: CreateSnapshotServiceOptions,
): SnapshotService {
  const {
    store,
    adapter,
    imageAdapter,
    now = () => Date.now(),
    idFactory = defaultIdFactory,
    maxSnapshots = 10,
  } = options

  return {
    async capture(input) {
      const raw =
        input.raw !== undefined
          ? input.raw
          : await adapter.getRaw(APP_DATA_STORAGE_KEY)

      const resolvedRaw =
        raw === null && input.data !== null
          ? serializeAppData(input.data)
          : raw

      let images: StoredImageEntry[]
      if (input.data === null) {
        images = await imageAdapter.listImages()
      } else {
        images = []
        for (const imageId of collectReferencedImageIds(input.data)) {
          const image = await imageAdapter.getImage(imageId)
          if (image) {
            images.push({ imageId, ...image })
          }
        }
      }

      const meta: SnapshotMeta = {
        id: idFactory(),
        createdAt: now(),
        reason: input.reason,
        appSchemaVersion:
          readSchemaVersion(resolvedRaw) ?? input.data?.schemaVersion ?? null,
        sizeBytes:
          utf8Bytes(resolvedRaw ?? '') +
          images.reduce((total, image) => total + image.bytes.byteLength, 0),
        imageCount: images.length,
      }

      await store.put(meta, {
        id: meta.id,
        raw: resolvedRaw,
        images,
      })

      // 保留最近 N 份。清理失败不影响已经写成功的快照，下次再清。
      try {
        const snapshots = await store.list()
        const keep = snapshots
          .slice(0, Math.max(1, maxSnapshots))
          .map((snapshot) => snapshot.id)
        await store.prune(keep)
      } catch {
        // 快照本身已经保存；淘汰失败只意味着暂时超过保留数量。
      }

      return meta
    },

    list() {
      return store.list()
    },

    read(id) {
      return store.get(id)
    },

    remove(id) {
      return store.remove(id)
    },
  }
}
