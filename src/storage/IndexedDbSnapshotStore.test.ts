import { describe, expect, it } from 'vitest'

import type { SnapshotMeta } from './SnapshotStore'
import { IndexedDbSnapshotStore } from './IndexedDbSnapshotStore'
import { TEST_SNAPSHOT_DB_NAME } from './namespaces'

let dbCounter = 0

function createStore(): IndexedDbSnapshotStore {
  dbCounter += 1
  return new IndexedDbSnapshotStore(
    globalThis.indexedDB,
    `${TEST_SNAPSHOT_DB_NAME}-${dbCounter}`,
  )
}

function meta(id: string, createdAt: number): SnapshotMeta {
  return {
    id,
    createdAt,
    reason: 'before-clear',
    appSchemaVersion: 2,
    sizeBytes: 10,
    imageCount: 1,
  }
}

describe('IndexedDbSnapshotStore', () => {
  it('round-trips metadata and payload', async () => {
    const store = createStore()
    await store.put(meta('a', 1), {
      id: 'a',
      raw: '{"schemaVersion":2}',
      images: [
        {
          imageId: 'img:a',
          mime: 'image/png',
          bytes: new Uint8Array([1, 2]),
        },
      ],
    })

    await expect(store.list()).resolves.toEqual([meta('a', 1)])
    const payload = await store.get('a')
    expect(payload?.raw).toBe('{"schemaVersion":2}')
    expect(payload?.images[0]?.imageId).toBe('img:a')
    expect(Array.from(payload?.images[0]?.bytes ?? [])).toEqual([1, 2])
  })

  it('lists newest first and ignores ties deterministically', async () => {
    const store = createStore()
    await store.put(meta('old', 1), { id: 'old', raw: null, images: [] })
    await store.put(meta('new', 3), { id: 'new', raw: null, images: [] })
    await store.put(meta('mid-b', 2), { id: 'mid-b', raw: null, images: [] })
    await store.put(meta('mid-a', 2), { id: 'mid-a', raw: null, images: [] })

    const list = await store.list()

    expect(list.map((snapshot) => snapshot.id)).toEqual([
      'new',
      'mid-b',
      'mid-a',
      'old',
    ])
    // list 只依赖 meta，不加载 payload。
    expect(list[0]).toEqual(meta('new', 3))
  })

  it('removes metadata and payload together', async () => {
    const store = createStore()
    await store.put(meta('a', 1), { id: 'a', raw: 'x', images: [] })

    await store.remove('a')

    await expect(store.list()).resolves.toEqual([])
    await expect(store.get('a')).resolves.toBeNull()
  })

  it('prunes everything not in the keep list', async () => {
    const store = createStore()
    for (const id of ['a', 'b', 'c']) {
      await store.put(meta(id, Number(id.charCodeAt(0))), {
        id,
        raw: id,
        images: [],
      })
    }

    await store.prune(['a', 'c'])

    await expect(store.list()).resolves.toEqual([meta('c', 99), meta('a', 97)])
    await expect(store.get('b')).resolves.toBeNull()
    await expect(store.get('a')).resolves.not.toBeNull()
  })

  it('returns null for unknown ids', async () => {
    const store = createStore()

    await expect(store.get('missing')).resolves.toBeNull()
  })

  it('reports a friendly error when the database cannot open', async () => {
    const broken = {
      open() {
        throw new Error('blocked')
      },
    } as unknown as IDBFactory
    const store = new IndexedDbSnapshotStore(
      broken,
      `${TEST_SNAPSHOT_DB_NAME}-broken`,
    )

    await expect(store.list()).rejects.toThrow('本地快照存储不可用')
  })
})
