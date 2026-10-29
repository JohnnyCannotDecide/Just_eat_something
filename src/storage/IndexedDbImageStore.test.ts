import { describe, expect, it } from 'vitest'

import { IndexedDbImageStore } from './IndexedDbImageStore'
import { TEST_IMAGE_DB_NAME } from './namespaces'

let dbCounter = 0

// 每个用例独立数据库，避免相互影响；名字带 test_ 命名空间。
function createStore(): IndexedDbImageStore {
  dbCounter += 1
  return new IndexedDbImageStore(
    globalThis.indexedDB,
    `${TEST_IMAGE_DB_NAME}-${dbCounter}`,
  )
}

const image = {
  mime: 'image/webp' as const,
  bytes: new Uint8Array([1, 2, 3, 4]),
}

describe('IndexedDbImageStore', () => {
  it('round-trips bytes and mime', async () => {
    const store = createStore()
    await store.putImage('img:a', image)

    const stored = await store.getImage('img:a')

    expect(stored?.mime).toBe('image/webp')
    expect(Array.from(stored?.bytes ?? [])).toEqual([1, 2, 3, 4])
  })

  it('overwrites an existing key', async () => {
    const store = createStore()
    await store.putImage('img:a', image)
    await store.putImage('img:a', {
      mime: 'image/jpeg',
      bytes: new Uint8Array([9]),
    })

    const stored = await store.getImage('img:a')

    expect(stored?.mime).toBe('image/jpeg')
    expect(Array.from(stored?.bytes ?? [])).toEqual([9])
  })

  it('returns null for missing keys', async () => {
    const store = createStore()

    await expect(store.getImage('img:missing')).resolves.toBeNull()
  })

  it('lists all images with their business keys', async () => {
    const store = createStore()
    await store.putImage('img:a', image)
    await store.putImage('img:b', {
      mime: 'image/png',
      bytes: new Uint8Array([5]),
    })

    const entries = await store.listImages()

    expect(
      entries
        .map((entry) => [entry.imageId, entry.mime])
        .sort((left, right) => left[0]!.localeCompare(right[0]!)),
    ).toEqual([
      ['img:a', 'image/webp'],
      ['img:b', 'image/png'],
    ])
  })

  it('batch-writes images without clearing existing ones', async () => {
    const store = createStore()
    await store.putImage('img:old', image)

    await store.putImages([
      { imageId: 'img:a', ...image },
      {
        imageId: 'img:b',
        mime: 'image/png',
        bytes: new Uint8Array([7]),
      },
    ])

    await expect(store.getImage('img:old')).resolves.not.toBeNull()
    await expect(store.getImage('img:a')).resolves.not.toBeNull()
    await expect(store.getImage('img:b')).resolves.not.toBeNull()
  })

  it('aborts the whole batch when one entry cannot be written', async () => {
    const store = createStore()
    await store.putImage('img:old', image)

    await expect(
      store.putImages([
        { imageId: 'img:a', ...image },
        {
          imageId: 'img:b',
          // 不可被结构化克隆，写入时抛错。
          mime: (() => undefined) as never,
          bytes: new Uint8Array([7]),
        },
      ]),
    ).rejects.toThrow('图片保存失败')

    await expect(store.getImage('img:a')).resolves.toBeNull()
    // 已有的图片不受影响。
    await expect(store.getImage('img:old')).resolves.not.toBeNull()
  })

  it('deletes a single image', async () => {
    const store = createStore()
    await store.putImage('img:a', image)
    await store.deleteImage('img:a')

    await expect(store.getImage('img:a')).resolves.toBeNull()
  })

  it('clears every image', async () => {
    const store = createStore()
    await store.putImage('img:a', image)
    await store.putImage('img:b', image)
    await store.clearImages()

    await expect(store.getImage('img:a')).resolves.toBeNull()
    await expect(store.getImage('img:b')).resolves.toBeNull()
  })

  it('reports a friendly error when the database cannot open', async () => {
    const broken = {
      open() {
        throw new Error('blocked')
      },
    } as unknown as IDBFactory
    const store = new IndexedDbImageStore(
      broken,
      `${TEST_IMAGE_DB_NAME}-broken`,
    )

    await expect(store.getImage('img:a')).rejects.toThrow('图片存储不可用')
  })
})
