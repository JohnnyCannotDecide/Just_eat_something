import { beforeEach, describe, expect, it } from 'vitest'

import type { CustomDish } from '@/core/types'
import { createMemoryImages, createMemorySnapshotStore } from '@/test/fakes'
import { clearTestStorage } from '@/test/storage'

import { APP_DATA_STORAGE_KEY, createEmptyAppData, serializeAppData } from './appData'
import { LocalStorageAdapter } from './LocalStorageAdapter'
import { TEST_STORAGE_PREFIX } from './namespaces'
import { createSnapshotService } from './snapshots'

const DAY = '2026-10-27'
const BASE_TIME = Date.UTC(2026, 9, 27, 12, 0, 0)

beforeEach(() => {
  clearTestStorage()
})

function customDish(imageId: string | null): CustomDish {
  return {
    id: 'custom_dish:a',
    name: '番茄炒蛋',
    imageId,
    emoji: '🍅',
    category: 'main',
    meals: ['lunch'],
    rarity: 'R',
    ingredientRows: [],
    calorieMode: 'total',
    calories: 480,
    cooking: null,
    includeInPool: true,
    archived: false,
    createdAt: DAY,
  }
}

function service(options: {
  now?: () => number
  maxSnapshots?: number
  raw?: string | null
} = {}) {
  const adapter = new LocalStorageAdapter(TEST_STORAGE_PREFIX)
  const images = createMemoryImages([
    { imageId: 'img:a', mime: 'image/png', bytes: new Uint8Array([1, 2]) },
    { imageId: 'img:orphan', mime: 'image/jpeg', bytes: new Uint8Array([9]) },
  ])
  const store = createMemorySnapshotStore()
  const snapshots = createSnapshotService({
    store,
    adapter,
    imageAdapter: images,
    now: options.now,
    maxSnapshots: options.maxSnapshots,
  })
  return { adapter, images, store, snapshots }
}

describe('snapshot service', () => {
  it('captures referenced images for known data', async () => {
    const { adapter, snapshots } = service()
    const data = {
      ...createEmptyAppData(DAY),
      customDishes: [customDish('img:a')],
    }
    const raw = serializeAppData(data)
    await adapter.setRaw(APP_DATA_STORAGE_KEY, raw)

    const meta = await snapshots.capture({ reason: 'before-clear', data })

    expect(meta.imageCount).toBe(1)
    expect(meta.sizeBytes).toBe(
      new TextEncoder().encode(raw).length + 2,
    )
    expect(meta.appSchemaVersion).toBe(5)

    const payload = await snapshots.read(meta.id)
    expect(payload?.raw).toBe(raw)
    expect(payload?.images.map((image) => image.imageId)).toEqual(['img:a'])
  })

  it('captures every image when data is unknown', async () => {
    const { snapshots } = service()

    const meta = await snapshots.capture({
      reason: 'migration',
      data: null,
      raw: '{"schemaVersion":1}',
    })

    expect(meta.imageCount).toBe(2)
    expect(meta.appSchemaVersion).toBe(1)
    const payload = await snapshots.read(meta.id)
    expect(
      payload?.images.map((image) => image.imageId).sort(),
    ).toEqual(['img:a', 'img:orphan'])
  })

  it('falls back to serialized data when no raw is stored', async () => {
    const { snapshots } = service()
    const data = createEmptyAppData(DAY)

    const meta = await snapshots.capture({ reason: 'before-restore', data })

    const payload = await snapshots.read(meta.id)
    expect(payload?.raw).toBe(serializeAppData(data))
    expect(meta.appSchemaVersion).toBe(5)
  })

  it('keeps only the newest 10 snapshots and removes their payloads', async () => {
    let tick = BASE_TIME
    const { store, snapshots } = service({
      maxSnapshots: 10,
      now: () => tick++,
    })

    for (let index = 0; index < 12; index += 1) {
      await snapshots.capture({
        reason: 'before-clear',
        data: createEmptyAppData(DAY),
      })
    }

    const list = await snapshots.list()
    expect(list).toHaveLength(10)
    expect(list.map((meta) => meta.createdAt)).toEqual(
      [...list].sort((a, b) => b.createdAt - a.createdAt).map((m) => m.createdAt),
    )
    expect(store.payloads.size).toBe(10)

    // 最早的两份连同 payload 一起被淘汰。
    const removed = [...store.metas.values()].map((meta) => meta.createdAt)
    expect(Math.min(...removed)).toBeGreaterThan(BASE_TIME + 1)
  })
})
