import { describe, expect, it, vi } from 'vitest'

import { AppStorage } from './AppStorage'
import type {
  BinaryStorageAdapter,
  StoredImage,
  StoredImageEntry,
} from './BinaryStorageAdapter'
import { CloudSyncAdapter } from './CloudSyncAdapter'
import type { StorageAdapter } from './StorageAdapter'

function createJsonPort() {
  const values = new Map<string, unknown>()
  const mocks = {
    get: vi.fn(async <T>(key: string) => (values.get(key) as T) ?? null),
    set: vi.fn(async <T>(key: string, value: T) => {
      values.set(key, value)
    }),
    getRaw: vi.fn(async (key: string) => {
      const value = values.get(key)
      return value === undefined ? null : String(value)
    }),
    setRaw: vi.fn(async (key: string, raw: string) => {
      values.set(key, raw)
    }),
    remove: vi.fn(async (key: string) => {
      values.delete(key)
    }),
    exportAll: vi.fn(async () => Object.fromEntries(values)),
  }
  return { port: mocks as unknown as StorageAdapter, mocks, values }
}

function createImagePort() {
  const images = new Map<string, StoredImage>()
  const mocks = {
    getImage: vi.fn(async (key: string) => images.get(key) ?? null),
    putImage: vi.fn(async (key: string, image: StoredImage) => {
      images.set(key, image)
    }),
    listImages: vi.fn(async () =>
      [...images.entries()].map(([imageId, image]) => ({ imageId, ...image })),
    ),
    putImages: vi.fn(async (entries: readonly StoredImageEntry[]) => {
      for (const { imageId, ...image } of entries) {
        images.set(imageId, image)
      }
    }),
    deleteImage: vi.fn(async (key: string) => {
      images.delete(key)
    }),
    clearImages: vi.fn(async () => {
      images.clear()
    }),
  }
  return { port: mocks as unknown as BinaryStorageAdapter, mocks, images }
}

describe('AppStorage', () => {
  it('routes JSON calls to the JSON port only', async () => {
    const json = createJsonPort()
    const images = createImagePort()
    const storage = new AppStorage(json.port, images.port)

    await storage.set('state', { count: 1 })
    await expect(storage.get('state')).resolves.toEqual({ count: 1 })
    await storage.setRaw('raw', '{"count":2}')
    await expect(storage.getRaw('raw')).resolves.toBe('{"count":2}')
    await expect(storage.exportAll()).resolves.toMatchObject({ raw: '{"count":2}' })
    await storage.remove('state')
    await expect(storage.get('state')).resolves.toBeNull()

    expect(images.mocks.getImage).not.toHaveBeenCalled()
    expect(images.mocks.listImages).not.toHaveBeenCalled()
  })

  it('routes image calls to the image port only', async () => {
    const json = createJsonPort()
    const images = createImagePort()
    const storage = new AppStorage(json.port, images.port)
    const image = { mime: 'image/png' as const, bytes: new Uint8Array([7]) }

    await storage.putImage('img:a', image)
    await expect(storage.getImage('img:a')).resolves.toEqual(image)
    await storage.putImages([{ imageId: 'img:b', ...image }])
    await expect(storage.listImages()).resolves.toEqual([
      { imageId: 'img:a', ...image },
      { imageId: 'img:b', ...image },
    ])
    await storage.deleteImage('img:a')
    await expect(storage.getImage('img:a')).resolves.toBeNull()
    await storage.putImage('img:a', image)
    await storage.clearImages()
    await expect(storage.getImage('img:a')).resolves.toBeNull()

    expect(json.mocks.get).not.toHaveBeenCalled()
    expect(json.mocks.getRaw).not.toHaveBeenCalled()
  })
})

describe('CloudSyncAdapter', () => {
  it('rejects every JSON and image method', async () => {
    const cloud = new CloudSyncAdapter()
    const image = { mime: 'image/png' as const, bytes: new Uint8Array([1]) }

    await expect(cloud.get('x')).rejects.toThrow('尚未实现')
    await expect(cloud.set('x', 1)).rejects.toThrow('尚未实现')
    await expect(cloud.getRaw('x')).rejects.toThrow('尚未实现')
    await expect(cloud.setRaw('x', 'raw')).rejects.toThrow('尚未实现')
    await expect(cloud.remove('x')).rejects.toThrow('尚未实现')
    await expect(cloud.exportAll()).rejects.toThrow('尚未实现')
    await expect(cloud.getImage('img:a')).rejects.toThrow('尚未实现')
    await expect(cloud.putImage('img:a', image)).rejects.toThrow('尚未实现')
    await expect(cloud.listImages()).rejects.toThrow('尚未实现')
    await expect(
      cloud.putImages([{ imageId: 'img:a', ...image }]),
    ).rejects.toThrow('尚未实现')
    await expect(cloud.deleteImage('img:a')).rejects.toThrow('尚未实现')
    await expect(cloud.clearImages()).rejects.toThrow('尚未实现')
  })
})
