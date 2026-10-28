import { describe, expect, it } from 'vitest'

import { IndexedDbImageStore } from './IndexedDbImageStore'

let dbCounter = 0

// 每个用例独立数据库，避免相互影响。
function createStore(): IndexedDbImageStore {
  dbCounter += 1
  return new IndexedDbImageStore(globalThis.indexedDB, `test-images-${dbCounter}`)
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
    const store = new IndexedDbImageStore(broken, 'test-images-broken')

    await expect(store.getImage('img:a')).rejects.toThrow('图片存储不可用')
  })
})
