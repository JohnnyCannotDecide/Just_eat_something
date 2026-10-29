import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createMemorySnapshots } from '@/test/fakes'
import { clearTestStorage } from '@/test/storage'

import v1Fixture from './__fixtures__/app-data-v1.json'
import v2Fixture from './__fixtures__/app-data-v2.json'
import v3Fixture from './__fixtures__/app-data-v3.json'
import v4Fixture from './__fixtures__/app-data-v4.json'
import {
  APP_DATA_CORRUPT_BACKUP_KEY,
  APP_DATA_SCHEMA_VERSION,
  APP_DATA_STORAGE_KEY,
  loadAppData,
  serializeAppData,
} from './appData'
import { LocalStorageAdapter } from './LocalStorageAdapter'
import { TEST_STORAGE_PREFIX } from './namespaces'

const DAY = '2026-10-27'

beforeEach(() => {
  clearTestStorage()
})

function setup(options: { failSnapshots?: boolean } = {}) {
  const adapter = new LocalStorageAdapter(TEST_STORAGE_PREFIX)
  const snapshots = createMemorySnapshots({ adapter })
  if (options.failSnapshots) {
    snapshots.failCapture = true
  }
  return { adapter, snapshots }
}

describe('loadAppData', () => {
  it('migrates a v1 fixture, keeps user data, and snapshots the original raw', async () => {
    const { adapter, snapshots } = setup()
    const fixtureRaw = JSON.stringify(v1Fixture, null, 2)
    await adapter.setRaw(APP_DATA_STORAGE_KEY, fixtureRaw)

    const result = await loadAppData(adapter, DAY, { snapshots })

    expect(result.status).toBe('migrated')
    expect(result.sourceVersion).toBe(1)
    expect(result.data.schemaVersion).toBe(APP_DATA_SCHEMA_VERSION)
    expect(result.data.profile).toMatchObject({ sex: 'female', weightKg: 60 })
    expect(result.data.pityCount).toBe(7)
    expect(result.data.days['2026-10-26']).toBeDefined()
    expect(result.data.stamps.dish_a?.checkInCount).toBe(2)
    expect(result.snapshotId).not.toBeNull()

    const snapshot = await snapshots.read(result.snapshotId!)
    expect(snapshot?.raw).toBe(fixtureRaw)
    const meta = await snapshots.list()
    expect(meta).toHaveLength(1)
    expect(meta[0]).toMatchObject({
      reason: 'migration',
      appSchemaVersion: 1,
    })

    // 原值一次成功替换为当前版本（v1 → v2 → v3 → v4）。
    const stored = await adapter.getRaw(APP_DATA_STORAGE_KEY)
    expect(JSON.parse(stored!).schemaVersion).toBe(APP_DATA_SCHEMA_VERSION)
    expect(JSON.parse(stored!).settings.showCalories).toBe(true)
    expect(stored).not.toBe(fixtureRaw)
  })

  it('migrates a v2 fixture, turns calorie display on, and keeps user data', async () => {
    const { adapter, snapshots } = setup()
    const fixtureRaw = JSON.stringify(v2Fixture, null, 2)
    await adapter.setRaw(APP_DATA_STORAGE_KEY, fixtureRaw)

    const result = await loadAppData(adapter, DAY, { snapshots })

    expect(result.status).toBe('migrated')
    expect(result.sourceVersion).toBe(2)
    expect(result.data.schemaVersion).toBe(APP_DATA_SCHEMA_VERSION)
    expect(result.data.settings).toEqual({
      showCalories: true,
      profileHintDismissed: true,
      theme: 'cute',
    })
    expect(result.data.profile).toMatchObject({ sex: 'female', weightKg: 60 })
    expect(result.data.pityCount).toBe(4)
    expect(result.data.days['2026-10-27']).toBeDefined()
    expect(result.data.stamps.white_rice?.checkInCount).toBe(1)

    const snapshot = await snapshots.read(result.snapshotId!)
    expect(snapshot?.raw).toBe(fixtureRaw)
    await expect(snapshots.list()).resolves.toMatchObject([
      { reason: 'migration', appSchemaVersion: 2 },
    ])

    const stored = await adapter.getRaw(APP_DATA_STORAGE_KEY)
    expect(JSON.parse(stored!).schemaVersion).toBe(APP_DATA_SCHEMA_VERSION)
    expect(JSON.parse(stored!).settings.showCalories).toBe(true)

    const second = await loadAppData(adapter, DAY, { snapshots })
    expect(second.status).toBe('ok')
    await expect(snapshots.list()).resolves.toHaveLength(1)
    expect(await adapter.getRaw(APP_DATA_STORAGE_KEY)).toBe(stored)
  })

  it('migrates a v3 fixture, fills missing names, and keeps user data', async () => {
    const { adapter, snapshots } = setup()
    const fixtureRaw = JSON.stringify(v3Fixture, null, 2)
    await adapter.setRaw(APP_DATA_STORAGE_KEY, fixtureRaw)

    const result = await loadAppData(adapter, DAY, { snapshots })

    expect(result.status).toBe('migrated')
    expect(result.sourceVersion).toBe(3)
    expect(result.data.schemaVersion).toBe(APP_DATA_SCHEMA_VERSION)

    const breakfast = result.data.days['2026-10-26']!.meals.breakfast
    expect(breakfast.candidateCombos.map((item) => item.name)).toEqual([
      '豆浆油条套餐',
      '豆浆油条套餐',
      '神秘早餐',
    ])
    expect(breakfast.candidateCombos[0]!.nameSource).toBe('legacy')
    expect(breakfast.candidateCombos[1]!.baseDishIds).toEqual([
      'soy_milk',
      'youtiao',
      'tea_egg',
    ])
    expect(
      result.data.days['2026-10-26']!.meals.lunch.candidateCombos[0]!.name,
    ).toBe('公司聚餐')
    expect(result.data.stamps.soy_milk?.checkInCount).toBe(2)
    expect(result.data.pityCount).toBe(2)

    const snapshot = await snapshots.read(result.snapshotId!)
    expect(snapshot?.raw).toBe(fixtureRaw)
    await expect(snapshots.list()).resolves.toMatchObject([
      { reason: 'migration', appSchemaVersion: 3 },
    ])

    const stored = await adapter.getRaw(APP_DATA_STORAGE_KEY)
    expect(JSON.parse(stored!).schemaVersion).toBe(APP_DATA_SCHEMA_VERSION)

    const second = await loadAppData(adapter, DAY, { snapshots })
    expect(second.status).toBe('ok')
    await expect(snapshots.list()).resolves.toHaveLength(1)
    expect(await adapter.getRaw(APP_DATA_STORAGE_KEY)).toBe(stored)
  })

  it('migrates a v4 fixture to v5 and keeps user data', async () => {
    const { adapter, snapshots } = setup()
    const fixtureRaw = JSON.stringify(v4Fixture, null, 2)
    await adapter.setRaw(APP_DATA_STORAGE_KEY, fixtureRaw)

    const result = await loadAppData(adapter, DAY, { snapshots })

    expect(result.status).toBe('migrated')
    expect(result.sourceVersion).toBe(4)
    expect(result.data.schemaVersion).toBe(APP_DATA_SCHEMA_VERSION)

    const breakfast = result.data.days['2026-10-26']!.meals.breakfast
    expect(breakfast.drawnComboIds).toEqual(['b_soy_youtiao'])
    expect(
      breakfast.candidateCombos[0]!.components[0]!.seenDishIds,
    ).toEqual([])
    expect(
      result.data.days['2026-10-26']!.meals.lunch.candidateCombos[0]!
        .components[0]!.seenDishIds,
    ).toEqual(['beef_veg_rice'])
    expect(result.data.stamps.soy_milk?.checkInCount).toBe(2)
    expect(result.data.customDishes).toHaveLength(1)

    const snapshot = await snapshots.read(result.snapshotId!)
    expect(snapshot?.raw).toBe(fixtureRaw)
    await expect(snapshots.list()).resolves.toMatchObject([
      { reason: 'migration', appSchemaVersion: 4 },
    ])

    const stored = await adapter.getRaw(APP_DATA_STORAGE_KEY)
    expect(JSON.parse(stored!).schemaVersion).toBe(APP_DATA_SCHEMA_VERSION)

    const second = await loadAppData(adapter, DAY, { snapshots })
    expect(second.status).toBe('ok')
    await expect(snapshots.list()).resolves.toHaveLength(1)
    expect(await adapter.getRaw(APP_DATA_STORAGE_KEY)).toBe(stored)
  })

  it('is idempotent: a second load reports ok and adds no snapshot', async () => {
    const { adapter, snapshots } = setup()
    await adapter.setRaw(APP_DATA_STORAGE_KEY, JSON.stringify(v1Fixture))

    await loadAppData(adapter, DAY, { snapshots })
    const afterFirst = await adapter.getRaw(APP_DATA_STORAGE_KEY)
    const result = await loadAppData(adapter, DAY, { snapshots })

    expect(result.status).toBe('ok')
    expect(await adapter.getRaw(APP_DATA_STORAGE_KEY)).toBe(afterFirst)
    await expect(snapshots.list()).resolves.toHaveLength(1)
  })

  it('does not overwrite valid current-version data on startup', async () => {
    const { adapter, snapshots } = setup()
    const current = serializeAppData({
      ...createEmptyLike(),
      pityCount: 3,
    })
    await adapter.setRaw(APP_DATA_STORAGE_KEY, current)
    const setSpy = vi.spyOn(adapter, 'set')
    const setRawSpy = vi.spyOn(adapter, 'setRaw')

    const result = await loadAppData(adapter, DAY, { snapshots })

    expect(result.status).toBe('ok')
    expect(result.data.pityCount).toBe(3)
    expect(await adapter.getRaw(APP_DATA_STORAGE_KEY)).toBe(current)
    expect(setSpy).not.toHaveBeenCalled()
    expect(setRawSpy).not.toHaveBeenCalled()
    await expect(snapshots.list()).resolves.toEqual([])
  })

  it('reports a new user without writing anything', async () => {
    const { adapter, snapshots } = setup()

    const result = await loadAppData(adapter, DAY, { snapshots })

    expect(result.status).toBe('new')
    expect(result.raw).toBeNull()
    await expect(adapter.getRaw(APP_DATA_STORAGE_KEY)).resolves.toBeNull()
    await expect(snapshots.list()).resolves.toEqual([])
  })

  it('rolls back when a migration throws', async () => {
    const { adapter, snapshots } = setup()
    const raw = JSON.stringify(v1Fixture)
    await adapter.setRaw(APP_DATA_STORAGE_KEY, raw)

    const result = await loadAppData(adapter, DAY, {
      snapshots,
      migrations: {
        2: () => {
          throw new Error('boom')
        },
      },
    })

    expect(result.status).toBe('migration-failed')
    expect(result.error).toContain('boom')
    expect(result.snapshotId).not.toBeNull()
    expect(await adapter.getRaw(APP_DATA_STORAGE_KEY)).toBe(raw)
    const meta = await snapshots.list()
    expect(meta[0]?.reason).toBe('migration')
  })

  it('rolls back when writing the migrated data fails', async () => {
    const { adapter, snapshots } = setup()
    const raw = JSON.stringify(v1Fixture)
    await adapter.setRaw(APP_DATA_STORAGE_KEY, raw)

    const failing = new LocalStorageAdapter(TEST_STORAGE_PREFIX)
    const original = failing.setRaw.bind(failing)
    let writes = 0
    vi.spyOn(failing, 'setRaw').mockImplementation(async (key, value) => {
      if (key === APP_DATA_STORAGE_KEY) {
        writes += 1
        if (writes === 1) {
          throw new Error('quota')
        }
      }
      await original(key, value)
    })

    const result = await loadAppData(failing, DAY, { snapshots })

    expect(result.status).toBe('migration-failed')
    expect(result.error).toContain('quota')
    expect(await adapter.getRaw(APP_DATA_STORAGE_KEY)).toBe(raw)
  })

  it('stops before migrating when the snapshot cannot be created', async () => {
    const { adapter, snapshots } = setup({ failSnapshots: true })
    const raw = JSON.stringify(v1Fixture)
    await adapter.setRaw(APP_DATA_STORAGE_KEY, raw)

    const result = await loadAppData(adapter, DAY, { snapshots })

    expect(result.status).toBe('migration-failed')
    expect(result.error).toContain('快照失败')
    expect(await adapter.getRaw(APP_DATA_STORAGE_KEY)).toBe(raw)
  })

  it('refuses to migrate without a snapshot service', async () => {
    const { adapter } = setup()
    const raw = JSON.stringify(v1Fixture)
    await adapter.setRaw(APP_DATA_STORAGE_KEY, raw)

    const result = await loadAppData(adapter, DAY)

    expect(result.status).toBe('migration-failed')
    expect(await adapter.getRaw(APP_DATA_STORAGE_KEY)).toBe(raw)
  })

  it('keeps corrupt JSON untouched and backs it up', async () => {
    const { adapter, snapshots } = setup()
    const raw = '{bad'
    await adapter.setRaw(APP_DATA_STORAGE_KEY, raw)

    const result = await loadAppData(adapter, DAY, { snapshots })

    expect(result.status).toBe('corrupt')
    expect(result.raw).toBe(raw)
    expect(await adapter.getRaw(APP_DATA_STORAGE_KEY)).toBe(raw)
    expect(await adapter.getRaw(APP_DATA_CORRUPT_BACKUP_KEY)).toBe(raw)
    const meta = await snapshots.list()
    expect(meta[0]).toMatchObject({ reason: 'before-recovery' })
  })

  it('treats structurally broken current-version data as corrupt without overwriting it', async () => {
    const { adapter, snapshots } = setup()
    const raw = JSON.stringify({ schemaVersion: APP_DATA_SCHEMA_VERSION, days: 'nope' })
    await adapter.setRaw(APP_DATA_STORAGE_KEY, raw)

    const result = await loadAppData(adapter, DAY, { snapshots })

    expect(result.status).toBe('corrupt')
    expect(await adapter.getRaw(APP_DATA_STORAGE_KEY)).toBe(raw)
  })

  it('rolls back broken old-version data instead of treating it as corrupt', async () => {
    const { adapter, snapshots } = setup()
    const raw = JSON.stringify({ schemaVersion: 2, days: 'nope' })
    await adapter.setRaw(APP_DATA_STORAGE_KEY, raw)

    const result = await loadAppData(adapter, DAY, { snapshots })

    expect(result.status).toBe('migration-failed')
    expect(await adapter.getRaw(APP_DATA_STORAGE_KEY)).toBe(raw)
  })

  it('refuses to touch future versions', async () => {
    const { adapter, snapshots } = setup()
    const raw = JSON.stringify({ schemaVersion: 99, pityCount: 1 })
    await adapter.setRaw(APP_DATA_STORAGE_KEY, raw)

    const result = await loadAppData(adapter, DAY, { snapshots })

    expect(result.status).toBe('future')
    expect(result.sourceVersion).toBe(99)
    expect(await adapter.getRaw(APP_DATA_STORAGE_KEY)).toBe(raw)
    await expect(snapshots.list()).resolves.toEqual([])
  })
})

/** 只做当前版本合法底稿，避免从磁盘读。 */
function createEmptyLike() {
  return {
    schemaVersion: APP_DATA_SCHEMA_VERSION,
    profile: null,
    targetCalories: null,
    pityCount: 0,
    days: {},
    stamps: {},
    customIngredients: [],
    customDishes: [],
    settings: {
      showCalories: true,
      profileHintDismissed: false,
      theme: 'cute' as const,
    },
  }
}
