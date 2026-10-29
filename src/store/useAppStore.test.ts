import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  calcMealCalories,
  createComboCandidate,
  createLegacyCandidate,
} from '@/core/components'
import { isTokenValid } from '@/core/tokens'
import type {
  BodyProfile,
  Combo,
  CustomDish,
  MealType,
} from '@/core/types'
import {
  APP_DATA_SCHEMA_VERSION,
  APP_DATA_STORAGE_KEY,
  createEmptyAppData,
  loadAppData,
} from '@/storage/appData'
import { combos, dishById, dishes } from '@/data'
import { PENDING_IMPORT_KEY } from '@/storage/backup'
import { LocalStorageAdapter } from '@/storage/LocalStorageAdapter'
import { TEST_STORAGE_PREFIX } from '@/storage/namespaces'
import { clearTestStorage } from '@/test/storage'
import { createMemoryImages, createMemorySnapshots } from '@/test/fakes'

import { createAppStore } from './useAppStore'
import type { CustomDishInput } from './useAppStore'

const DAY_1 = '2026-10-27'
const DAY_2 = '2026-10-28'

const profile: BodyProfile = {
  sex: 'female',
  age: 30,
  heightCm: 165,
  weightKg: 60,
  activity: 'sedentary',
  goal: 'maintain',
}

beforeEach(() => {
  clearTestStorage()
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 27, 12, 0, 0))
})

afterEach(() => {
  vi.useRealTimers()
})

function setup(rng: () => number = () => 0) {
  const adapter = new LocalStorageAdapter(TEST_STORAGE_PREFIX)
  const images = createMemoryImages()
  const snapshots = createMemorySnapshots({ adapter, images })
  const store = createAppStore(adapter, undefined, rng, images, {
    snapshots,
    namespace: 'test',
  })
  return { adapter, images, snapshots, store }
}

/** 模拟刷新页面：同一个存储端口上新建一个 store。 */
function reopen(ctx: ReturnType<typeof setup>) {
  return createAppStore(ctx.adapter, undefined, () => 0, ctx.images, {
    snapshots: ctx.snapshots,
    namespace: 'test',
  })
}

function customDish(overrides: Partial<CustomDish> = {}): CustomDish {
  return {
    id: 'custom_dish:a',
    name: '番茄炒蛋',
    imageId: 'img:a',
    emoji: '🍅',
    category: 'main',
    meals: ['lunch'],
    rarity: 'R',
    ingredientRows: [
      { name: '番茄', kcalPer100g: 20, grams: 200 },
    ],
    calorieMode: 'ingredients',
    calories: null,
    cooking: null,
    includeInPool: true,
    archived: false,
    createdAt: DAY_1,
    ...overrides,
  }
}

function currentMeal(
  store: ReturnType<typeof setup>['store'],
  type: MealType,
) {
  const state = store.getState()
  return state.data.days[state.todayKey]!.meals[type]
}

async function drawAndSelect(
  store: ReturnType<typeof setup>['store'],
  type: MealType,
) {
  await store.getState().hydrate()
  const result = await store.getState().drawMeal(type)
  if (result.status !== 'drawn') {
    throw new Error(`抽卡失败: ${result.status}`)
  }
  await store.getState().selectCombo(type, result.receipt.candidate.id)
  return result.receipt.candidate
}

describe('useAppStore', () => {
  it('hydrates, initializes today, and persists the result', async () => {
    const { adapter, store } = setup()

    await store.getState().hydrate()

    const state = store.getState()
    expect(state.status).toBe('ready')
    expect(state.todayKey).toBe(DAY_1)
    expect(state.data.schemaVersion).toBe(APP_DATA_SCHEMA_VERSION)
    expect(state.data.days[DAY_1]).toBeDefined()
    await expect(adapter.get(APP_DATA_STORAGE_KEY)).resolves.toEqual(state.data)
  })

  it('hydrates only once when called concurrently', async () => {
    const { adapter, store } = setup()
    const getSpy = vi.spyOn(adapter, 'getRaw')

    await Promise.all([
      store.getState().hydrate(),
      store.getState().hydrate(),
      store.getState().hydrate(),
    ])

    const dataReads = getSpy.mock.calls.filter(
      ([key]) => key === APP_DATA_STORAGE_KEY,
    )
    expect(dataReads).toHaveLength(1)
    expect(store.getState().status).toBe('ready')
  })

  it('computes and persists target calories when the profile changes', async () => {
    const { adapter, store } = setup()
    await store.getState().hydrate()

    await store.getState().updateProfile(profile)

    expect(store.getState().data.profile).toEqual(profile)
    expect(store.getState().data.targetCalories).toBe(1584)
    await expect(loadAppData(adapter, DAY_1)).resolves.toMatchObject({
      status: 'ok',
      data: { profile, targetCalories: 1584 },
    })
  })

  it('keeps calorie display on through the first profile save', async () => {
    const { adapter, store } = setup()
    await store.getState().hydrate()
    expect(store.getState().data.settings.showCalories).toBe(true)

    await store.getState().updateProfile(profile)

    expect(store.getState().data.settings.showCalories).toBe(true)
    await expect(loadAppData(adapter, DAY_1)).resolves.toMatchObject({
      data: { settings: { showCalories: true } },
    })
  })

  it('keeps the user’s calorie switch when editing an existing profile', async () => {
    const { store } = setup()
    await store.getState().hydrate()
    await store.getState().updateProfile(profile)
    await store.getState().setShowCalories(false)

    await store.getState().updateProfile({ ...profile, weightKg: 65 })

    expect(store.getState().data.profile?.weightKg).toBe(65)
    expect(store.getState().data.settings.showCalories).toBe(false)
  })

  it('lets a guest toggle the calorie switch', async () => {
    const { store } = setup()
    await store.getState().hydrate()

    await store.getState().setShowCalories(false)
    expect(store.getState().data.settings.showCalories).toBe(false)

    await store.getState().setShowCalories(true)
    expect(store.getState().data.settings.showCalories).toBe(true)
  })

  it('persists the chosen theme across hydration', async () => {
    const ctx = setup()
    await ctx.store.getState().hydrate()
    expect(ctx.store.getState().data.settings.theme).toBe('cute')

    await ctx.store.getState().setTheme('vivid')

    expect(ctx.store.getState().data.settings.theme).toBe('vivid')
    await expect(loadAppData(ctx.adapter, DAY_1)).resolves.toMatchObject({
      data: { settings: { theme: 'vivid' } },
    })

    const second = reopen(ctx)
    await second.getState().hydrate()
    expect(second.getState().data.settings.theme).toBe('vivid')
  })

  it('returns to the default theme after clearing data', async () => {
    const ctx = setup()
    await ctx.store.getState().hydrate()
    await ctx.store.getState().setTheme('simple')

    await expect(ctx.store.getState().clearData()).resolves.toMatchObject({
      status: 'cleared',
    })

    expect(ctx.store.getState().data.settings.theme).toBe('cute')
    await expect(ctx.adapter.get(APP_DATA_STORAGE_KEY)).resolves.toMatchObject({
      settings: { theme: 'cute' },
    })
  })

  it('dismisses the guest hint persistently', async () => {
    const { adapter, store } = setup()
    await store.getState().hydrate()

    await store.getState().dismissProfileHint()

    expect(store.getState().data.settings.profileHintDismissed).toBe(true)
    await expect(loadAppData(adapter, DAY_1)).resolves.toMatchObject({
      data: { settings: { profileHintDismissed: true } },
    })
  })

  it('clears the profile while keeping records, stamps, and hint state', async () => {
    const { store } = setup()
    await store.getState().hydrate()
    await store.getState().updateProfile(profile)
    await store.getState().setShowCalories(false)
    await store.getState().recordStamp('dish_a', DAY_1)
    await store.getState().dismissProfileHint()

    await store.getState().clearProfile()

    const state = store.getState().data
    expect(state.profile).toBeNull()
    expect(state.targetCalories).toBeNull()
    expect(state.settings.showCalories).toBe(false)
    expect(state.settings.profileHintDismissed).toBe(true)
    expect(state.stamps.dish_a?.checkInCount).toBe(1)
    expect(state.days[DAY_1]).toBeDefined()
  })

  it('hydrates legacy data with the correct calorie visibility', async () => {
    const { adapter, store } = setup()
    await adapter.set(APP_DATA_STORAGE_KEY, {
      schemaVersion: 1,
      profile,
      targetCalories: 1584,
      pityCount: 0,
      days: {},
      stamps: {},
    })

    await store.getState().hydrate()

    expect(store.getState().data.settings).toEqual({
      showCalories: true,
      profileHintDismissed: true,
      theme: 'cute',
    })
    await expect(adapter.get(APP_DATA_STORAGE_KEY)).resolves.toMatchObject({
      schemaVersion: 5,
      settings: {
        showCalories: true,
        profileHintDismissed: true,
        theme: 'cute',
      },
    })
  })

  it('hydrates legacy guest data without leaking a stale target', async () => {
    const { adapter, store } = setup()
    await adapter.set(APP_DATA_STORAGE_KEY, {
      schemaVersion: 1,
      profile: null,
      targetCalories: 1600,
      pityCount: 0,
      days: {},
      stamps: {},
    })

    await store.getState().hydrate()

    expect(store.getState().data.settings.showCalories).toBe(true)
    expect(store.getState().data.settings.profileHintDismissed).toBe(false)
  })

  it('rolls over to a new day and expires the old token wallet', async () => {
    const { adapter, store } = setup()
    await store.getState().hydrate()

    await store.getState().updateData((data) => {
      const day = data.days[DAY_1]!
      return {
        ...data,
        days: {
          ...data.days,
          [DAY_1]: {
            ...day,
            tokens: { ...day.tokens, count: 2 },
          },
        },
      }
    })

    vi.setSystemTime(new Date(2026, 9, 28, 8, 0, 0))
    await store.getState().refreshForToday()

    const state = store.getState()
    expect(state.todayKey).toBe(DAY_2)
    expect(state.data.days[DAY_1]!.tokens.count).toBe(2)
    expect(state.data.days[DAY_2]!.tokens).toEqual({
      dateKey: DAY_2,
      count: 0,
      customRewardClaimed: false,
    })
    expect(isTokenValid(state.data.days[DAY_1]!.tokens, DAY_2)).toBe(false)

    const persisted = await loadAppData(adapter, DAY_2)
    expect(persisted.data.days[DAY_2]).toBeDefined()
  })

  it('ensures today before any write', async () => {
    const { store } = setup()
    await store.getState().hydrate()

    vi.setSystemTime(new Date(2026, 9, 28, 20, 0, 0))
    await store.getState().updateProfile(profile)

    const state = store.getState()
    expect(state.todayKey).toBe(DAY_2)
    expect(state.data.days[DAY_2]).toBeDefined()
    expect(state.data.profile).toEqual(profile)
  })

  it('exports and imports the full AppData JSON', async () => {
    const { store } = setup()
    await store.getState().hydrate()
    await store.getState().updateProfile(profile)
    await store.getState().recordStamp('dish_a', DAY_1)

    const original = store.getState().data
    const exported = await store.getState().exportBackup()
    if (exported.status !== 'ok') {
      throw new Error(exported.message)
    }

    await store.getState().updateProfile(null)
    expect(store.getState().data.profile).toBeNull()

    await expect(
      store.getState().importJson(exported.json),
    ).resolves.toEqual({ status: 'imported' })

    expect(store.getState().data).toEqual(original)
    expect(store.getState().data.stamps.dish_a?.checkInCount).toBe(1)
  })

  it('exports and restores custom dish images', async () => {
    const { images, store } = setup()
    await store.getState().hydrate()
    await images.putImage('img:a', {
      mime: 'image/webp',
      bytes: new Uint8Array([1, 2, 3]),
    })
    await store.getState().updateData((data) => ({
      ...data,
      customDishes: [customDish()],
    }))

    const exported = await store.getState().exportBackup()
    if (exported.status !== 'ok') {
      throw new Error(exported.message)
    }
    expect(exported.json).toContain('diet-diary-backup')

    await expect(store.getState().clearData()).resolves.toEqual({
      status: 'cleared',
    })
    expect(images.images.size).toBe(0)

    await expect(
      store.getState().importJson(exported.json),
    ).resolves.toEqual({ status: 'imported' })

    expect(store.getState().data.customDishes).toHaveLength(1)
    expect(store.getState().data.customDishes[0]?.name).toBe('番茄炒蛋')
    const restored = await images.getImage('img:a')
    expect(restored?.mime).toBe('image/webp')
    expect(Array.from(restored?.bytes ?? [])).toEqual([1, 2, 3])
  })

  it('rejects backups with an unknown format', async () => {
    const { store } = setup()
    await store.getState().hydrate()

    await expect(
      store.getState().importJson(JSON.stringify({ hello: 'world' })),
    ).resolves.toEqual({
      status: 'error',
      message: '导入失败：无法识别的备份格式',
    })
  })

  it('keeps existing data when a backup references a missing image', async () => {
    const { store } = setup()
    await store.getState().hydrate()
    await store.getState().updateData((data) => ({
      ...data,
      customDishes: [customDish({ imageId: 'img:missing' })],
    }))

    const before = store.getState().data
    await expect(
      store.getState().exportBackup(),
    ).resolves.toEqual({
      status: 'error',
      message: '有自制菜图片已经丢失，无法导出完整备份',
    })
    expect(store.getState().data).toEqual(before)
  })

  it('clears uploaded images together with the data', async () => {
    const { images, store } = setup()
    await store.getState().hydrate()
    await images.putImage('img:a', {
      mime: 'image/png',
      bytes: new Uint8Array([9]),
    })

    await expect(store.getState().clearData()).resolves.toEqual({
      status: 'cleared',
    })
    expect(images.images.size).toBe(0)
  })

  it('imports a v1 backup as combo snapshots', async () => {
    const { store } = setup()
    await store.getState().hydrate()

    const result = await store.getState().importJson(
      JSON.stringify({
        schemaVersion: 1,
        profile: null,
        targetCalories: null,
        pityCount: 2,
        days: {
          [DAY_1]: {
            meals: {
              lunch: {
                candidateDishIds: ['white_rice'],
                selectedDishId: 'white_rice',
                actualGrams: { cooked_rice: 300 },
                calories: 348,
                budget: { baseUsed: 1, adUsed: 0, checkedIn: true },
              },
            },
          },
        },
        stamps: {},
      }),
    )

    expect(result).toEqual({ status: 'imported' })

    const state = store.getState()
    const lunch = state.data.days[DAY_1]!.meals.lunch
    const candidate = lunch.candidateCombos[0]!

    expect(state.data.schemaVersion).toBe(5)
    expect(state.data.pityCount).toBe(2)
    expect(candidate.id).toBe(`legacy:${DAY_1}:lunch:white_rice`)
    expect(lunch.selectedCandidateId).toBe(candidate.id)
    expect(lunch.calories).toBe(348)
    expect(candidate.components[0]).toMatchObject({
      dishId: 'white_rice',
      grams: 300,
      eaten: true,
    })
  })

  it('returns an error without leaving the ready state when import fails', async () => {
    const { store } = setup()
    await store.getState().hydrate()

    const before = store.getState().data
    await expect(
      store.getState().importJson('{bad json'),
    ).resolves.toEqual({
      status: 'error',
      message: '导入失败：不是合法的 JSON',
    })

    expect(store.getState().data).toEqual(before)
    expect(store.getState().status).toBe('ready')
  })

  it('clears all data and only keeps an empty today record', async () => {
    const { adapter, store } = setup()
    await store.getState().hydrate()
    await store.getState().updateProfile(profile)
    await store.getState().recordStamp('dish_a', DAY_1)

    await expect(store.getState().clearData()).resolves.toEqual({
      status: 'cleared',
    })

    const state = store.getState()
    expect(state.status).toBe('ready')
    expect(state.lastDiscard).toBeNull()
    expect(state.data.profile).toBeNull()
    expect(state.data.targetCalories).toBeNull()
    expect(state.data.stamps).toEqual({})
    expect(state.data.pityCount).toBe(0)
    expect(Object.keys(state.data.days)).toEqual([DAY_1])
    await expect(adapter.get(APP_DATA_STORAGE_KEY)).resolves.toEqual(
      state.data,
    )
  })

  it('keeps data when clearing fails to persist', async () => {
    const { adapter, store } = setup()
    await store.getState().hydrate()
    await store.getState().updateProfile(profile)

    const before = store.getState().data
    vi.spyOn(adapter, 'set').mockRejectedValueOnce(new Error('存储空间不足'))

    await expect(store.getState().clearData()).resolves.toEqual({
      status: 'error',
      message: '存储空间不足',
    })

    expect(store.getState().data).toEqual(before)
    expect(store.getState().status).toBe('ready')
  })

  it('switches back when the clock moves backwards without losing history', async () => {
    const { store } = setup()
    await store.getState().hydrate()

    vi.setSystemTime(new Date(2026, 9, 28, 8, 0, 0))
    await store.getState().refreshForToday()
    await store.getState().updateProfile(profile)
    expect(store.getState().todayKey).toBe(DAY_2)

    vi.setSystemTime(new Date(2026, 9, 27, 8, 0, 0))
    await store.getState().refreshForToday()

    expect(store.getState().todayKey).toBe(DAY_1)
    expect(store.getState().data.days[DAY_2]).toBeDefined()
    expect(store.getState().data.days[DAY_2]!.dateKey).toBe(DAY_2)

    vi.setSystemTime(new Date(2026, 9, 28, 9, 0, 0))
    await store.getState().refreshForToday()

    expect(store.getState().todayKey).toBe(DAY_2)
    expect(store.getState().data.profile).toEqual(profile)
  })
})

describe('data safety', () => {
  it('does not rewrite existing v2 data when the app starts', async () => {
    const ctx = setup()
    await ctx.store.getState().hydrate()
    await ctx.store.getState().updateProfile(profile)
    const raw = await ctx.adapter.getRaw(APP_DATA_STORAGE_KEY)

    const setSpy = vi.spyOn(ctx.adapter, 'set')
    const setRawSpy = vi.spyOn(ctx.adapter, 'setRaw')

    const reopened = reopen(ctx)
    await reopened.getState().hydrate()

    expect(reopened.getState().status).toBe('ready')
    expect(reopened.getState().data.profile).toEqual(profile)
    expect(await ctx.adapter.getRaw(APP_DATA_STORAGE_KEY)).toBe(raw)
    expect(setSpy).not.toHaveBeenCalled()
    expect(setRawSpy).not.toHaveBeenCalled()
  })

  it('enters recovery mode without touching corrupt raw data', async () => {
    const ctx = setup()
    await ctx.store.getState().hydrate()
    await ctx.adapter.setRaw(APP_DATA_STORAGE_KEY, '{bad')

    const reopened = reopen(ctx)
    await reopened.getState().hydrate()

    const state = reopened.getState()
    expect(state.status).toBe('recovery')
    expect(state.recovery?.reason).toBe('corrupt')
    expect(state.recovery?.raw).toBe('{bad')
    expect(await ctx.adapter.getRaw(APP_DATA_STORAGE_KEY)).toBe('{bad')
  })

  it('snapshots before clearing and can restore records and images', async () => {
    const ctx = setup()
    await ctx.store.getState().hydrate()
    await ctx.store.getState().updateProfile(profile)
    await ctx.store.getState().recordStamp('dish_a', DAY_1)
    await ctx.images.putImage('img:a', {
      mime: 'image/png',
      bytes: new Uint8Array([1, 2]),
    })
    await ctx.store
      .getState()
      .updateData((data) => ({ ...data, customDishes: [customDish()] }))
    const rawBefore = await ctx.adapter.getRaw(APP_DATA_STORAGE_KEY)

    await expect(ctx.store.getState().clearData()).resolves.toEqual({
      status: 'cleared',
    })
    expect(ctx.images.images.size).toBe(0)

    const listed = await ctx.store.getState().listSnapshots()
    expect(listed.status).toBe('ok')
    if (listed.status !== 'ok') return
    expect(listed.snapshots[0]?.reason).toBe('before-clear')

    await expect(
      ctx.store.getState().restoreSnapshot(listed.snapshots[0]!.id),
    ).resolves.toEqual({ status: 'restored' })

    const restored = ctx.store.getState()
    expect(restored.status).toBe('ready')
    expect(restored.data.profile).toEqual(profile)
    expect(restored.data.stamps.dish_a?.checkInCount).toBe(1)
    expect(restored.data.customDishes).toHaveLength(1)
    expect(await ctx.adapter.getRaw(APP_DATA_STORAGE_KEY)).toBe(rawBefore)
    expect(ctx.images.images.has('img:a')).toBe(true)
    // 恢复前又生成了一份当前（空）状态的快照。
    const afterRestore = await ctx.snapshots.list()
    expect(
      afterRestore.some((snapshot) => snapshot.reason === 'before-restore'),
    ).toBe(true)
  })

  it('snapshots before clearing the profile', async () => {
    const ctx = setup()
    await ctx.store.getState().hydrate()
    await ctx.store.getState().updateProfile(profile)

    await expect(ctx.store.getState().clearProfile()).resolves.toEqual({
      status: 'cleared',
    })

    const list = await ctx.snapshots.list()
    expect(list[0]?.reason).toBe('before-clear-profile')
    const payload = await ctx.snapshots.read(list[0]!.id)
    expect(payload?.raw).not.toBeNull()
    expect(JSON.parse(payload!.raw!).profile).toEqual(profile)
  })

  it('snapshots before a successful import', async () => {
    const ctx = setup()
    await ctx.store.getState().hydrate()
    await ctx.store.getState().updateProfile(profile)

    const exported = await ctx.store.getState().exportBackup()
    if (exported.status !== 'ok') throw new Error(exported.message)

    await expect(
      ctx.store.getState().importJson(exported.json),
    ).resolves.toEqual({ status: 'imported' })

    const list = await ctx.snapshots.list()
    expect(list[0]?.reason).toBe('before-import')
  })

  it('keeps data and images when the pre-clear snapshot fails', async () => {
    const ctx = setup()
    await ctx.store.getState().hydrate()
    await ctx.store.getState().updateProfile(profile)
    await ctx.images.putImage('img:a', {
      mime: 'image/png',
      bytes: new Uint8Array([1]),
    })
    const before = ctx.store.getState().data
    ctx.snapshots.failCapture = true

    const result = await ctx.store.getState().clearData()

    expect(result.status).toBe('error')
    expect(ctx.store.getState().data).toEqual(before)
    expect(ctx.store.getState().data.profile).toEqual(profile)
    expect(ctx.images.images.has('img:a')).toBe(true)
    expect(await ctx.adapter.get(APP_DATA_STORAGE_KEY)).toMatchObject({
      profile,
    })
  })

  it('cleans pending import images but keeps referenced ones', async () => {
    const ctx = setup()
    await ctx.store.getState().hydrate()
    await ctx.images.putImage('img:keep', {
      mime: 'image/png',
      bytes: new Uint8Array([1]),
    })
    await ctx.images.putImage('img:orphan', {
      mime: 'image/png',
      bytes: new Uint8Array([2]),
    })
    await ctx.store
      .getState()
      .updateData((data) => ({
        ...data,
        customDishes: [customDish({ imageId: 'img:keep' })],
      }))
    await ctx.adapter.set(PENDING_IMPORT_KEY, {
      imageIds: ['img:keep', 'img:orphan'],
    })

    const reopened = reopen(ctx)
    await reopened.getState().hydrate()

    expect(reopened.getState().status).toBe('ready')
    // 当前数据仍引用的图片必须保留，只清理真正的孤儿。
    expect(ctx.images.images.has('img:keep')).toBe(true)
    expect(ctx.images.images.has('img:orphan')).toBe(false)
    await expect(ctx.adapter.get(PENDING_IMPORT_KEY)).resolves.toBeNull()
  })

  it('resets after recovery with a snapshot and keeps images', async () => {
    const ctx = setup()
    await ctx.store.getState().hydrate()
    await ctx.images.putImage('img:a', {
      mime: 'image/png',
      bytes: new Uint8Array([1]),
    })
    await ctx.adapter.setRaw(APP_DATA_STORAGE_KEY, '{bad')

    const reopened = reopen(ctx)
    await reopened.getState().hydrate()
    expect(reopened.getState().status).toBe('recovery')

    await expect(reopened.getState().resetAfterRecovery()).resolves.toEqual({
      status: 'reset',
    })

    const state = reopened.getState()
    expect(state.status).toBe('ready')
    expect(state.recovery).toBeNull()
    expect(state.data.profile).toBeNull()
    expect(ctx.images.images.has('img:a')).toBe(true)
    expect(await ctx.adapter.getRaw(APP_DATA_STORAGE_KEY)).not.toBe('{bad')
    const list = await ctx.snapshots.list()
    expect(list.some((snapshot) => snapshot.reason === 'before-recovery')).toBe(
      true,
    )
  })
})

describe('combo draws', () => {
  it('draws a combo into the meal pool and persists pity/candidates', async () => {
    const { adapter, store } = setup()
    await store.getState().hydrate()

    const result = await store.getState().drawMeal('breakfast')

    expect(result.status).toBe('drawn')
    if (result.status !== 'drawn') return
    expect(result.receipt.candidate.comboId).toBe('b_soy_youtiao')
    expect(result.receipt.source).toBe('base')
    expect(result.receipt.candidate.components.length).toBeGreaterThan(0)

    const meal = currentMeal(store, 'breakfast')
    expect(meal.candidateCombos.map((item) => item.comboId)).toEqual([
      'b_soy_youtiao',
    ])
    expect(meal.selectedCandidateId).toBeNull()
    expect(meal.budget).toEqual({
      baseUsed: 1,
      adUsed: 0,
      checkedIn: false,
    })
    expect(store.getState().data.pityCount).toBe(1)

    await expect(loadAppData(adapter, DAY_1)).resolves.toMatchObject({
      data: { pityCount: 1 },
    })
  })

  it('requires an ad without writing, and cancels without consuming', async () => {
    const { store } = setup()
    await store.getState().hydrate()
    await store.getState().drawMeal('breakfast')
    await store.getState().drawMeal('breakfast')

    const before = store.getState().data
    await expect(store.getState().drawMeal('breakfast')).resolves.toEqual({
      status: 'ad-required',
    })
    expect(store.getState().data).toEqual(before)

    await expect(
      store.getState().completeAdDraw('breakfast', false, DAY_1),
    ).resolves.toEqual({ status: 'ad-cancelled' })
    expect(store.getState().data).toEqual(before)

    const completed = await store.getState().completeAdDraw(
      'breakfast',
      true,
      DAY_1,
    )
    expect(completed.status).toBe('drawn')
    if (completed.status !== 'drawn') return

    const meal = currentMeal(store, 'breakfast')
    expect(completed.receipt.source).toBe('ad')
    expect(meal.budget.adUsed).toBe(1)
    expect(meal.candidateCombos).toHaveLength(3)
  })

  it('rejects a stale ad completion after the date changes', async () => {
    const { store } = setup()
    await store.getState().hydrate()
    await store.getState().drawMeal('breakfast')
    await store.getState().drawMeal('breakfast')
    await expect(store.getState().drawMeal('breakfast')).resolves.toEqual({
      status: 'ad-required',
    })

    vi.setSystemTime(new Date(2026, 9, 28, 8, 0, 0))
    const result = await store.getState().completeAdDraw(
      'breakfast',
      true,
      DAY_1,
    )

    expect(result.status).toBe('stale')
    expect(
      store.getState().data.days[DAY_1]!.meals.breakfast.budget.adUsed,
    ).toBe(0)
    expect(
      store.getState().data.days[DAY_1]!.meals.breakfast.candidateCombos,
    ).toHaveLength(2)
  })

  it('selects a candidate in the pool and rejects others', async () => {
    const { store } = setup()
    await store.getState().hydrate()
    const drawn = await store.getState().drawMeal('breakfast')
    if (drawn.status !== 'drawn') throw new Error('draw failed')
    const candidateId = drawn.receipt.candidate.id

    expect(
      await store.getState().selectCombo('breakfast', candidateId),
    ).toEqual({ status: 'selected' })
    expect(currentMeal(store, 'breakfast').selectedCandidateId).toBe(
      candidateId,
    )

    expect(
      await store.getState().selectCombo('breakfast', 'not-a-combo'),
    ).toEqual({ status: 'blocked', reason: 'not-in-pool' })
  })

  it('serializes concurrent draws instead of losing one', async () => {
    const { store } = setup()
    await store.getState().hydrate()

    const results = await Promise.all([
      store.getState().drawMeal('lunch'),
      store.getState().drawMeal('lunch'),
    ])

    expect(results.map((result) => result.status)).toEqual(['drawn', 'drawn'])
    const meal = currentMeal(store, 'lunch')
    expect(meal.candidateCombos).toHaveLength(2)
    expect(
      new Set(meal.candidateCombos.map((item) => item.comboId)).size,
    ).toBe(2)
    expect(meal.budget.baseUsed).toBe(2)
  })

  it('keeps drawing through ads without a per-meal cap', async () => {
    const { store } = setup()
    await store.getState().hydrate()
    await store.getState().drawMeal('breakfast')
    await store.getState().drawMeal('breakfast')

    for (let index = 0; index < 4; index += 1) {
      const result = await store.getState().completeAdDraw(
        'breakfast',
        true,
        DAY_1,
      )
      expect(result.status).toBe('drawn')
      if (result.status === 'drawn') {
        expect(result.receipt.source).toBe('ad')
      }
    }

    const meal = currentMeal(store, 'breakfast')
    expect(meal.budget.adUsed).toBe(4)
    expect(meal.candidateCombos).toHaveLength(6)
  })

  it('reshuffles an exhausted round and keeps unique candidate ids', async () => {
    const { adapter, store } = setup()
    const pool = combos.filter((combo) => combo.meals.includes('breakfast'))
    const target = pool.find((combo) => combo.rarity === 'R')!
    const previous = pool.find((combo) => combo.id !== target.id)!
    const round = [
      target.id,
      ...pool
        .filter((combo) => combo.id !== target.id && combo.id !== previous.id)
        .map((combo) => combo.id),
      previous.id,
    ]
    const seedCandidate = createComboCandidate(target, 'draw', target.id, {
      dishById,
    })
    const data = createEmptyAppData(DAY_1)
    const day = data.days[DAY_1]!
    await adapter.set(APP_DATA_STORAGE_KEY, {
      ...data,
      days: {
        ...data.days,
        [DAY_1]: {
          ...day,
          meals: {
            ...day.meals,
            breakfast: {
              ...day.meals.breakfast,
              candidateCombos: [seedCandidate],
              selectedCandidateId: null,
              drawnComboIds: round,
              budget: { baseUsed: 1, adUsed: 0, checkedIn: false },
            },
          },
        },
      },
    })
    await store.getState().hydrate()

    const result = await store.getState().drawMeal('breakfast')

    expect(result.status).toBe('drawn')
    if (result.status !== 'drawn') return
    expect(result.receipt.shuffled).toBe(true)
    expect(result.receipt.singleCandidate).toBe(false)
    expect(result.receipt.candidate.comboId).toBe(target.id)
    expect(result.receipt.candidate.id).toBe(`${target.id}#2`)

    const meal = currentMeal(store, 'breakfast')
    expect(meal.candidateCombos.map((item) => item.id)).toEqual([
      target.id,
      `${target.id}#2`,
    ])
    expect(meal.drawnComboIds).toEqual([target.id])
  })

  it('reports save failures without leaving the ready state or losing data', async () => {
    const { adapter, store } = setup()
    await store.getState().hydrate()
    vi.spyOn(adapter, 'set').mockRejectedValueOnce(new Error('存储空间不足'))

    const result = await store.getState().drawMeal('breakfast')

    expect(result).toEqual({ status: 'error', message: '存储空间不足' })
    expect(store.getState().status).toBe('ready')
    expect(currentMeal(store, 'breakfast').candidateCombos).toHaveLength(0)

    const retry = await store.getState().drawMeal('breakfast')
    expect(retry.status).toBe('drawn')
  })
})

describe('component actions', () => {
  it('redraws a component with the same meal and category', async () => {
    const { store } = setup()
    const candidate = await drawAndSelect(store, 'breakfast')
    const target = candidate.components[0]!

    const result = await store.getState().redrawComponent(
      'breakfast',
      candidate.id,
      target.id,
    )

    expect(result.status).toBe('redrawn')
    const meal = currentMeal(store, 'breakfast')
    const nextCandidate = meal.candidateCombos[0]!
    const replacement = nextCandidate.components.find(
      (item) => item.origin === 'redraw',
    )!

    expect(replacement).toBeDefined()
    expect(replacement.id).not.toBe(target.id)
    expect(replacement.category).toBe(target.category)
    expect(replacement.rarity).not.toBe('UR')
    expect(dishById.get(replacement.dishId!)?.meals).toContain('breakfast')

    const dishIds = nextCandidate.components.map((item) => item.dishId)
    expect(new Set(dishIds).size).toBe(dishIds.length)
    expect(meal.budget.baseUsed).toBe(2)
  })

  it('requires and then completes an ad for a redraw', async () => {
    const { store } = setup()
    const candidate = await drawAndSelect(store, 'breakfast')

    await store.getState().redrawComponent(
      'breakfast',
      candidate.id,
      candidate.components[0]!.id,
    )
    const before = store.getState().data
    await expect(
      store.getState().redrawComponent(
        'breakfast',
        candidate.id,
        candidate.components[1]!.id,
      ),
    ).resolves.toEqual({ status: 'ad-required' })
    expect(store.getState().data).toEqual(before)

    await expect(
      store
        .getState()
        .completeAdRedraw(
          'breakfast',
          candidate.id,
          candidate.components[1]!.id,
          false,
          DAY_1,
        ),
    ).resolves.toEqual({ status: 'ad-cancelled' })
    expect(store.getState().data).toEqual(before)

    const completed = await store
      .getState()
      .completeAdRedraw(
        'breakfast',
        candidate.id,
        candidate.components[1]!.id,
        true,
        DAY_1,
      )
    expect(completed.status).toBe('redrawn')
    if (completed.status !== 'redrawn') return
    expect(completed.source).toBe('ad')
    expect(currentMeal(store, 'breakfast').budget.adUsed).toBe(1)
  })

  it('persists seen dishes and reports a reshuffle for a redraw', async () => {
    const { adapter, store } = setup()
    const staples = dishes.filter(
      (dish) =>
        dish.meals.includes('breakfast') &&
        dish.category === 'staple' &&
        dish.rarity !== 'UR',
    )
    const target = staples[0]!
    const combo: Combo = {
      id: 'test_staple_combo',
      name: target.name,
      rarity: 'R',
      meals: ['breakfast'],
      components: [target.id],
    }
    const candidate = createComboCandidate(combo, 'draw', 'test_candidate', {
      dishById,
    })
    const seeded = {
      ...candidate,
      components: candidate.components.map((component) => ({
        ...component,
        seenDishIds: staples.map((dish) => dish.id),
      })),
    }
    const data = createEmptyAppData(DAY_1)
    const day = data.days[DAY_1]!
    await adapter.set(APP_DATA_STORAGE_KEY, {
      ...data,
      days: {
        ...data.days,
        [DAY_1]: {
          ...day,
          meals: {
            ...day.meals,
            breakfast: {
              ...day.meals.breakfast,
              candidateCombos: [seeded],
              selectedCandidateId: 'test_candidate',
            },
          },
        },
      },
    })
    await store.getState().hydrate()

    const result = await store.getState().redrawComponent(
      'breakfast',
      'test_candidate',
      seeded.components[0]!.id,
    )

    expect(result.status).toBe('redrawn')
    if (result.status !== 'redrawn') return
    expect(result.shuffled).toBe(true)

    const next = currentMeal(store, 'breakfast').candidateCombos[0]!
    const replacement = next.components[0]!
    expect(replacement.seenDishIds).toEqual([
      target.id,
      replacement.dishId,
    ])
    expect(replacement.dishId).not.toBe(staples.at(-2)!.id)
  })

  it('rejects redraws for a candidate that is not selected', async () => {
    const { store } = setup()
    await store.getState().hydrate()
    const first = await store.getState().drawMeal('breakfast')
    const second = await store.getState().drawMeal('breakfast')
    if (first.status !== 'drawn' || second.status !== 'drawn') {
      throw new Error('draw failed')
    }
    const firstCandidate = currentMeal(store, 'breakfast').candidateCombos[0]!
    await store.getState().selectCombo('breakfast', firstCandidate.id)

    expect(
      await store.getState().redrawComponent(
        'breakfast',
        second.receipt.candidate.id,
        second.receipt.candidate.components[0]!.id,
      ),
    ).toEqual({ status: 'blocked', reason: 'not-in-pool' })
  })

  it('adds library dishes and custom components', async () => {
    const { store } = setup()
    const candidate = await drawAndSelect(store, 'breakfast')

    await expect(
      store.getState().addComponent('breakfast', candidate.id, 'boiled_egg'),
    ).resolves.toEqual({ status: 'updated' })
    await expect(
      store.getState().addComponent('breakfast', candidate.id, 'boiled_egg'),
    ).resolves.toEqual({
      status: 'error',
      message: '这个套餐里已经有这道菜了',
    })
    await expect(
      store.getState().addComponent('breakfast', candidate.id, 'missing_dish'),
    ).resolves.toEqual({ status: 'blocked', reason: 'missing-dish' })

    await expect(
      store.getState().addCustomComponent('breakfast', candidate.id, {
        name: '  奶茶  ',
        calories: 300,
      }),
    ).resolves.toEqual({ status: 'updated' })

    const components = currentMeal(store, 'breakfast').candidateCombos[0]!
      .components
    expect(components).toHaveLength(candidate.components.length + 2)
    expect(components.at(-2)?.origin).toBe('manual')
    expect(components.at(-1)).toMatchObject({
      kind: 'custom',
      name: '奶茶',
      calories: 300,
    })
  })

  it('discards and undoes the most recent discard', async () => {
    const { store } = setup()
    const candidate = await drawAndSelect(store, 'breakfast')
    const target = candidate.components[0]!

    await expect(
      store.getState().discardComponent(
        'breakfast',
        candidate.id,
        target.id,
      ),
    ).resolves.toEqual({ status: 'updated' })

    expect(store.getState().lastDiscard).toEqual({
      dateKey: DAY_1,
      meal: 'breakfast',
      candidateId: candidate.id,
      componentId: target.id,
    })
    expect(
      currentMeal(store, 'breakfast').candidateCombos[0]!.components.find(
        (item) => item.id === target.id,
      )?.discarded,
    ).toBe(true)

    await expect(store.getState().undoDiscard()).resolves.toEqual({
      status: 'updated',
    })
    expect(store.getState().lastDiscard).toBeNull()
    expect(
      currentMeal(store, 'breakfast').candidateCombos[0]!.components.find(
        (item) => item.id === target.id,
      )?.discarded,
    ).toBe(false)

    await expect(store.getState().undoDiscard()).resolves.toEqual({
      status: 'blocked',
      reason: 'missing-discard',
    })
  })

  it('refuses to discard every component', async () => {
    const { store } = setup()
    const candidate = await drawAndSelect(store, 'breakfast')

    for (const component of candidate.components.slice(0, -1)) {
      await store
        .getState()
        .discardComponent('breakfast', candidate.id, component.id)
    }

    await expect(
      store.getState().discardComponent(
        'breakfast',
        candidate.id,
        candidate.components.at(-1)!.id,
      ),
    ).resolves.toEqual({
      status: 'error',
      message: '至少要保留一个部件',
    })
  })

  it('persists eaten, gram, and custom calorie edits', async () => {
    const { store } = setup()
    const candidate = await drawAndSelect(store, 'breakfast')
    const component = candidate.components[0]!

    await expect(
      store
        .getState()
        .setComponentEaten(
          'breakfast',
          candidate.id,
          component.id,
          false,
        ),
    ).resolves.toEqual({ status: 'updated' })

    const ingredientKey = component.ingredients[0]!.ingredientId!
    await expect(
      store.getState().updateComponentGrams('breakfast', candidate.id, component.id, {
        [ingredientKey]: 50,
      }),
    ).resolves.toEqual({ status: 'updated' })

    const afterGrams = currentMeal(store, 'breakfast').candidateCombos[0]!
      .components.find((item) => item.id === component.id)!
    expect(afterGrams.eaten).toBe(false)
    expect(afterGrams.ingredients[0]?.grams).toBe(50)
    expect(afterGrams.grams).toBe(
      afterGrams.ingredients.reduce((sum, item) => sum + item.grams, 0),
    )

    await store.getState().addCustomComponent('breakfast', candidate.id, {
      name: '奶茶',
      calories: 100,
    })
    const custom = currentMeal(store, 'breakfast').candidateCombos[0]!
      .components.at(-1)!
    await expect(
      store
        .getState()
        .updateComponentCalories('breakfast', candidate.id, custom.id, 250),
    ).resolves.toEqual({ status: 'updated' })
    expect(
      currentMeal(store, 'breakfast').candidateCombos[0]!.components.at(-1)
        ?.calories,
    ).toBe(250)

    await expect(
      store
        .getState()
        .updateComponentCalories('breakfast', candidate.id, component.id, 10),
    ).resolves.toEqual({
      status: 'error',
      message: '只有自定义记录可以直接修改热量',
    })
  })
})

describe('combo renaming', () => {
  it('renames the selected candidate and persists the manual name', async () => {
    const { store } = setup()
    const candidate = await drawAndSelect(store, 'breakfast')

    await expect(
      store.getState().renameCombo('breakfast', candidate.id, ' 我的早餐 '),
    ).resolves.toEqual({ status: 'updated' })

    const saved = currentMeal(store, 'breakfast').candidateCombos[0]!
    expect(saved.name).toBe('我的早餐')
    expect(saved.nameSource).toBe('manual')
    expect(saved.manualName).toBe('我的早餐')
  })

  it('restores the original combo name when clearing the manual name', async () => {
    const { store } = setup()
    const candidate = await drawAndSelect(store, 'breakfast')
    const original = candidate.name

    await store.getState().renameCombo('breakfast', candidate.id, '临时名字')
    await store.getState().renameCombo('breakfast', candidate.id, null)

    const saved = currentMeal(store, 'breakfast').candidateCombos[0]!
    expect(saved.name).toBe(original)
    expect(saved.nameSource).toBe('auto')
    expect(saved.manualName).toBeUndefined()
  })

  it('keeps a manual name through a component redraw', async () => {
    const { store } = setup()
    const candidate = await drawAndSelect(store, 'breakfast')
    await store.getState().renameCombo('breakfast', candidate.id, '手动名字')

    await expect(
      store
        .getState()
        .redrawComponent('breakfast', candidate.id, candidate.components[0]!.id),
    ).resolves.toMatchObject({ status: 'redrawn' })

    const saved = currentMeal(store, 'breakfast').candidateCombos[0]!
    expect(saved.name).toBe('手动名字')
    expect(saved.nameSource).toBe('manual')
  })

  it('rejects empty and over-long names without touching data', async () => {
    const { store } = setup()
    const candidate = await drawAndSelect(store, 'breakfast')
    const before = store.getState().data

    await expect(
      store.getState().renameCombo('breakfast', candidate.id, '   '),
    ).resolves.toEqual({ status: 'error', message: '套餐名不能为空' })
    await expect(
      store
        .getState()
        .renameCombo('breakfast', candidate.id, '一二三四五六七八九十一'),
    ).resolves.toEqual({
      status: 'error',
      message: '套餐名最多 10 个字',
    })
    expect(store.getState().data).toBe(before)
  })

  it('blocks renaming when nothing is selected or the candidate is unknown', async () => {
    const { store } = setup()
    await store.getState().hydrate()

    await expect(
      store.getState().renameCombo('breakfast', 'missing', '名字'),
    ).resolves.toEqual({ status: 'blocked', reason: 'no-selection' })

    const candidate = await drawAndSelect(store, 'breakfast')
    await expect(
      store.getState().renameCombo('breakfast', 'other-candidate', '名字'),
    ).resolves.toEqual({ status: 'blocked', reason: 'not-in-pool' })
    expect(
      currentMeal(store, 'breakfast').candidateCombos[0]!.id,
    ).toBe(candidate.id)
  })

  it('updates the auto name after discarding and restores it on undo', async () => {
    const { store } = setup()
    const candidate = await drawAndSelect(store, 'breakfast')
    const original = candidate.name

    await store
      .getState()
      .discardComponent('breakfast', candidate.id, candidate.components[0]!.id)
    const afterDiscard = currentMeal(store, 'breakfast').candidateCombos[0]!
    expect(afterDiscard.name).not.toBe(original)
    expect(afterDiscard.nameSource).toBe('auto')

    await expect(store.getState().undoDiscard()).resolves.toEqual({
      status: 'updated',
    })
    const restored = currentMeal(store, 'breakfast').candidateCombos[0]!
    expect(restored.name).toBe(original)
  })

  it('blocks renaming after check-in', async () => {
    const { store } = setup()
    const candidate = await drawAndSelect(store, 'breakfast')
    await store.getState().checkInMeal('breakfast')

    await expect(
      store.getState().renameCombo('breakfast', candidate.id, '事后改名'),
    ).resolves.toEqual({ status: 'blocked', reason: 'checked-in' })
  })

  it('writes the final name into the check-in receipt and frozen snapshot', async () => {
    const { store } = setup()
    const candidate = await drawAndSelect(store, 'breakfast')
    await store.getState().renameCombo('breakfast', candidate.id, '番茄早安')

    const result = await store.getState().checkInMeal('breakfast')

    expect(result.status).toBe('checked-in')
    if (result.status !== 'checked-in') {
      throw new Error('打卡失败')
    }
    expect(result.receipt.name).toBe('番茄早安')

    const saved = currentMeal(store, 'breakfast').candidateCombos[0]!
    expect(saved.name).toBe('番茄早安')
    expect(saved.nameSource).toBe('manual')
    expect(currentMeal(store, 'breakfast').budget.checkedIn).toBe(true)
  })
})

describe('check-in', () => {
  it('records a partial meal with only the eaten components stamped', async () => {
    const { store } = setup()
    const candidate = await drawAndSelect(store, 'breakfast')
    const skipped = candidate.components[0]!
    const eaten = candidate.components.slice(1)

    const result = await store
      .getState()
      .checkInMeal('breakfast', { eaten: { [skipped.id]: false } })

    expect(result.status).toBe('checked-in')
    if (result.status !== 'checked-in') return

    expect(result.receipt.stamps.map((stamp) => stamp.dish.id)).toEqual(
      eaten.map((component) => component.dishId),
    )
    expect(result.receipt.calories).toBe(
      calcMealCalories(
        candidate.components.map((component) =>
          component.id === skipped.id
            ? { ...component, eaten: false }
            : component,
        ),
      ),
    )
    expect(result.receipt.tokenRewarded).toBe(true)
    expect(result.receipt.tokenCount).toBe(1)

    const state = store.getState()
    const meal = state.data.days[DAY_1]!.meals.breakfast
    expect(meal.calories).toBe(result.receipt.calories)
    expect(meal.budget.checkedIn).toBe(true)
    expect(state.lastDiscard).toBeNull()
    expect(
      Object.keys(state.data.stamps).sort(),
    ).toEqual(
      eaten
        .map((component) => component.dishId!)
        .sort(),
    )
    expect(state.data.days[DAY_1]!.tokens.count).toBe(1)

    await expect(store.getState().drawMeal('breakfast')).resolves.toEqual({
      status: 'blocked',
      reason: 'checked-in',
    })
  })

  it('returns one stamp receipt per eaten library dish', async () => {
    const { store } = setup()
    const candidate = await drawAndSelect(store, 'breakfast')

    const result = await store.getState().checkInMeal('breakfast')

    expect(result.status).toBe('checked-in')
    if (result.status !== 'checked-in') return

    expect(result.receipt.name).toBe(candidate.name)
    expect(result.receipt.stamps).toHaveLength(candidate.components.length)
    for (const stamp of result.receipt.stamps) {
      expect(stamp).toMatchObject({
        count: 1,
        tier: 'bronze',
        previousTier: null,
        upgraded: false,
        dateKey: DAY_1,
      })
    }
    expect(result.receipt.components).toHaveLength(candidate.components.length)
  })

  it('stamps the same dish only once within a meal', async () => {
    const { store } = setup()
    await store.getState().hydrate()

    const duplicate = createComboCandidate(
      {
        id: 'dup_combo',
        name: '双份米饭',
        rarity: 'R',
        meals: ['lunch'],
        components: ['white_rice', 'white_rice'],
      },
      'draw',
      'dup_candidate',
    )

    await store.getState().updateData((data) => {
      const day = data.days[DAY_1]!
      const lunch = day.meals.lunch
      return {
        ...data,
        days: {
          ...data.days,
          [DAY_1]: {
            ...day,
            meals: {
              ...day.meals,
              lunch: {
                ...lunch,
                candidateCombos: [duplicate],
                selectedCandidateId: duplicate.id,
              },
            },
          },
        },
      }
    })

    const result = await store.getState().checkInMeal('lunch')
    expect(result.status).toBe('checked-in')
    if (result.status !== 'checked-in') return

    expect(result.receipt.stamps).toHaveLength(1)
    expect(result.receipt.stamps[0]?.dish.id).toBe('white_rice')
    expect(result.receipt.calories).toBe(464)
    expect(store.getState().data.stamps.white_rice?.checkInCount).toBe(1)
  })

  it('blocks check-in without a selection', async () => {
    const { store } = setup()
    await store.getState().hydrate()

    await expect(store.getState().checkInMeal('lunch')).resolves.toEqual({
      status: 'blocked',
      reason: 'no-selection',
    })
  })
})

describe('custom-only check-in', () => {
  it('awards a token for the first custom record of the day only', async () => {
    const { store } = setup()
    await store.getState().hydrate()

    const lunch = await store.getState().checkInCustomMeal('lunch', {
      name: '  朋友聚餐  ',
      calories: 800.4,
    })
    expect(lunch.status).toBe('checked-in')
    if (lunch.status !== 'checked-in') return
    expect(lunch.receipt).toMatchObject({
      rewardKind: 'custom',
      name: '朋友聚餐',
      calories: 800,
      tokenRewarded: true,
      tokenCount: 1,
      stamps: [],
    })

    const dinner = await store.getState().checkInCustomMeal('dinner', {
      name: '夜宵',
      calories: 300,
    })
    expect(dinner.status).toBe('checked-in')
    if (dinner.status !== 'checked-in') return
    expect(dinner.receipt.tokenRewarded).toBe(false)
    expect(dinner.receipt.tokenCount).toBe(1)

    const state = store.getState()
    const lunchMeal = state.data.days[DAY_1]!.meals.lunch
    expect(lunchMeal.candidateCombos).toHaveLength(1)
    expect(lunchMeal.selectedCandidateId).toBe(
      `custom:${DAY_1}:lunch:0`,
    )
    expect(lunchMeal.budget.checkedIn).toBe(true)
    expect(lunchMeal.candidateCombos[0]?.components[0]).toMatchObject({
      kind: 'custom',
      name: '朋友聚餐',
      calories: 800,
    })
    expect(state.data.days[DAY_1]!.tokens.count).toBe(1)
    expect(state.data.stamps).toEqual({})

    await expect(store.getState().drawMeal('lunch')).resolves.toEqual({
      status: 'blocked',
      reason: 'checked-in',
    })
  })

  it('records a custom meal with a null calorie value', async () => {
    const { store } = setup()
    await store.getState().hydrate()

    const result = await store.getState().checkInCustomMeal('lunch', {
      name: ' 没算热量的一餐 ',
      calories: null,
    })

    expect(result.status).toBe('checked-in')
    if (result.status !== 'checked-in') return
    expect(result.receipt).toMatchObject({
      rewardKind: 'custom',
      name: '没算热量的一餐',
      calories: null,
      tokenRewarded: true,
      stamps: [],
    })

    const meal = currentMeal(store, 'lunch')
    expect(meal.calories).toBeNull()
    expect(meal.budget.checkedIn).toBe(true)
    expect(meal.candidateCombos[0]?.components[0]?.calories).toBeNull()
  })
})

describe('stamp tiers', () => {
  it('turns the same dish bronze, silver, and gold across seven days', async () => {
    const { store } = setup()
    await store.getState().hydrate()

    const tiers: string[] = []
    const upgradeDays: number[] = []
    const previousTiers: (string | null)[] = []

    for (let index = 0; index < 7; index += 1) {
      if (index > 0) {
        vi.setSystemTime(new Date(2026, 9, 27 + index, 12, 0, 0))
        await store.getState().refreshForToday()
      }

      const todayKey = store.getState().todayKey
      const candidate = createLegacyCandidate({
        dateKey: todayKey,
        meal: 'breakfast',
        dishId: 'white_rice',
        eaten: true,
      })

      await store.getState().updateData((data) => {
        const day = data.days[todayKey]!
        const breakfast = day.meals.breakfast
        return {
          ...data,
          days: {
            ...data.days,
            [todayKey]: {
              ...day,
              meals: {
                ...day.meals,
                breakfast: {
                  ...breakfast,
                  candidateCombos: [candidate],
                  selectedCandidateId: candidate.id,
                },
              },
            },
          },
        }
      })

      const result = await store.getState().checkInMeal('breakfast')
      expect(result.status).toBe('checked-in')
      if (result.status !== 'checked-in') return

      const stamp = result.receipt.stamps[0]!
      expect(stamp).toMatchObject({ count: index + 1, dateKey: todayKey })
      tiers.push(stamp.tier)
      previousTiers.push(stamp.previousTier)
      if (stamp.upgraded) {
        upgradeDays.push(index + 1)
      }
    }

    expect(tiers).toEqual([
      'bronze',
      'bronze',
      'silver',
      'silver',
      'silver',
      'silver',
      'gold',
    ])
    expect(upgradeDays).toEqual([3, 7])
    expect(previousTiers).toEqual([
      null,
      'bronze',
      'bronze',
      'silver',
      'silver',
      'silver',
      'silver',
    ])

    const record = store.getState().data.stamps.white_rice
    expect(record).toMatchObject({
      checkInCount: 7,
      firstCheckInDate: DAY_1,
    })
    expect(record?.checkInDates).toHaveLength(7)
    expect(record?.checkInDates.at(-1)).toBe('2026-11-02')
  })
})

describe('custom dish actions', () => {
  function dishInput(
    overrides: Partial<CustomDishInput> = {},
  ): CustomDishInput {
    return {
      name: '番茄炒蛋',
      emoji: '🍅',
      category: 'main',
      meals: ['lunch'],
      rarity: 'R',
      ingredientRows: [{ name: '番茄', kcalPer100g: 20, grams: 200 }],
      calorieMode: 'ingredients',
      calories: null,
      cooking: null,
      includeInPool: true,
      ...overrides,
    }
  }

  const image = (byte: number, mime: 'image/png' | 'image/webp' = 'image/png') => ({
    bytes: new Uint8Array([byte, byte + 1]),
    mime,
  })

  it('creates a dish, its custom ingredient, and the uploaded image', async () => {
    const { adapter, images, store } = setup()
    await store.getState().hydrate()

    const result = await store
      .getState()
      .createCustomDish(dishInput({ image: image(1) }))

    expect(result.status).toBe('saved')
    if (result.status !== 'saved') return

    const state = store.getState()
    const dish = state.data.customDishes[0]!
    expect(dish.id).toBe(result.dishId)
    expect(dish.id.startsWith('custom_dish:')).toBe(true)
    expect(dish.name).toBe('番茄炒蛋')
    expect(dish.emoji).toBe('🍅')
    expect(dish.archived).toBe(false)
    expect(dish.includeInPool).toBe(true)
    expect(dish.imageId).toBeTruthy()
    expect(Array.from(images.images.get(dish.imageId!)!.bytes)).toEqual([
      1, 2,
    ])

    const ingredient = state.data.customIngredients[0]!
    expect(ingredient.name).toBe('番茄')
    expect(ingredient.kcalPer100g).toBe(20)
    expect(dish.ingredientRows[0]!.ingredientId).toBe(ingredient.id)

    const persisted = await loadAppData(adapter)
    expect(persisted.data.customDishes[0]!.name).toBe('番茄炒蛋')
  })

  it('draws a hidden custom combo into a real custom dish snapshot', async () => {
    // 稀有度随机值 0 → R 桶；条目随机值 0.9999 → 桶内最后一项，
    // 即追加在官方套餐之后的隐藏自制套餐。
    const values = [0, 0.9999]
    const { store } = setup(() => values.shift() ?? 0)
    await store.getState().hydrate()

    const created = await store.getState().createCustomDish(
      dishInput({
        meals: ['dinner'],
        category: 'staple',
        calorieMode: 'total',
        calories: 480,
        ingredientRows: [],
        image: image(1),
      }),
    )
    expect(created.status).toBe('saved')
    if (created.status !== 'saved') return

    const result = await store.getState().drawMeal('dinner')
    expect(result.status).toBe('drawn')
    if (result.status !== 'drawn') return

    const dish = store
      .getState()
      .data.customDishes.find((item) => item.id === created.dishId)!
    const candidate = result.receipt.candidate
    expect(candidate.name).toBe('番茄炒蛋')
    expect(candidate.rarity).toBe('R')
    expect(candidate.components).toHaveLength(1)
    expect(candidate.components[0]).toMatchObject({
      dishId: dish.id,
      name: '番茄炒蛋',
      category: 'staple',
      calories: 480,
      imageId: dish.imageId,
      image: '',
    })
    expect(candidate.components[0]!.ingredients).toEqual([])
  })

  it('creates a total-calorie dish without ingredient rows or image', async () => {
    const { images, store } = setup()
    await store.getState().hydrate()

    const result = await store.getState().createCustomDish(
      dishInput({
        calorieMode: 'total',
        calories: 480,
        ingredientRows: [],
      }),
    )

    expect(result.status).toBe('saved')
    const dish = store.getState().data.customDishes[0]!
    expect(dish.calorieMode).toBe('total')
    expect(dish.calories).toBe(480)
    expect(dish.ingredientRows).toEqual([])
    expect(dish.imageId).toBeNull()
    expect(images.images.size).toBe(0)
  })

  it('rejects invalid input without touching storage', async () => {
    const { adapter, store } = setup()
    await store.getState().hydrate()

    const result = await store.getState().createCustomDish(
      dishInput({ ingredientRows: [] }),
    )

    expect(result.status).toBe('error')
    if (result.status === 'error') {
      expect(result.message).toContain('至少添加一种食材')
    }
    expect(store.getState().data.customDishes).toEqual([])
    const persisted = await loadAppData(adapter)
    expect(persisted.data.customDishes).toEqual([])
  })

  it('replaces the image and removes the unreferenced old one', async () => {
    const { images, store } = setup()
    await store.getState().hydrate()
    const created = await store
      .getState()
      .createCustomDish(dishInput({ image: image(1) }))
    if (created.status !== 'saved') throw new Error('create failed')
    const before = store.getState().data.customDishes[0]!
    const oldImageId = before.imageId!

    const updated = await store.getState().updateCustomDish(created.dishId, {
      ...dishInput({ name: '番茄炒蛋 Plus' }),
      image: image(9, 'image/webp'),
    })

    expect(updated.status).toBe('saved')
    const after = store.getState().data.customDishes[0]!
    expect(after.name).toBe('番茄炒蛋 Plus')
    expect(after.imageId).not.toBe(oldImageId)
    expect(images.images.has(oldImageId)).toBe(false)
    expect(images.images.has(after.imageId!)).toBe(true)
  })

  it('removes the image when the edit clears it', async () => {
    const { images, store } = setup()
    await store.getState().hydrate()
    const created = await store
      .getState()
      .createCustomDish(dishInput({ image: image(1) }))
    if (created.status !== 'saved') throw new Error('create failed')
    const oldImageId = store.getState().data.customDishes[0]!.imageId!

    const updated = await store
      .getState()
      .updateCustomDish(created.dishId, { ...dishInput(), image: null })

    expect(updated.status).toBe('saved')
    const dish = store.getState().data.customDishes[0]!
    expect(dish.imageId).toBeNull()
    expect(images.images.has(oldImageId)).toBe(false)
  })

  it('archives instead of deleting when the dish has check-in records', async () => {
    const { images, store } = setup()
    await store.getState().hydrate()
    const created = await store
      .getState()
      .createCustomDish(dishInput({ image: image(1) }))
    if (created.status !== 'saved') throw new Error('create failed')
    const imageId = store.getState().data.customDishes[0]!.imageId!
    await store.getState().recordStamp(created.dishId)

    const result = await store
      .getState()
      .deleteCustomDish(created.dishId)

    expect(result).toEqual({ status: 'removed', archived: true })
    const dish = store.getState().data.customDishes[0]!
    expect(dish.archived).toBe(true)
    expect(dish.includeInPool).toBe(false)
    expect(images.images.has(imageId)).toBe(true)
    expect(store.getState().data.stamps[created.dishId]?.checkInCount).toBe(1)
  })

  it('truly deletes an unused dish and cleans its ingredient and image', async () => {
    const { images, store } = setup()
    await store.getState().hydrate()
    const created = await store
      .getState()
      .createCustomDish(dishInput({ image: image(1) }))
    if (created.status !== 'saved') throw new Error('create failed')
    const imageId = store.getState().data.customDishes[0]!.imageId!

    const result = await store
      .getState()
      .deleteCustomDish(created.dishId)

    expect(result).toEqual({ status: 'removed', archived: false })
    const state = store.getState()
    expect(state.data.customDishes).toEqual([])
    expect(state.data.customIngredients).toEqual([])
    expect(images.images.has(imageId)).toBe(false)
  })

  it('keeps an image that history still references', async () => {
    const { images, store } = setup()
    await store.getState().hydrate()
    const created = await store
      .getState()
      .createCustomDish(dishInput({ image: image(1) }))
    if (created.status !== 'saved') throw new Error('create failed')
    const dish = store.getState().data.customDishes[0]!

    // 模拟历史里还有这道菜的部件快照引用这张图。
    await store.getState().updateData((data) => ({
      ...data,
      days: {
        ...data.days,
        [DAY_1]: {
          ...data.days[DAY_1]!,
          meals: {
            ...data.days[DAY_1]!.meals,
            lunch: {
              ...data.days[DAY_1]!.meals.lunch,
              candidateCombos: [
                {
                  id: 'history',
                  comboId: null,
                  source: 'draw',
                  name: '历史套餐',
                  rarity: 'R',
                  components: [
                    {
                      id: 'comp:history',
                      kind: 'dish',
                      origin: 'combo',
                      dishId: created.dishId,
                      name: dish.name,
                      category: 'main',
                      rarity: 'R',
                      image: '',
                      ...(dish.imageId ? { imageId: dish.imageId } : {}),
                      cooking: null,
                      ingredients: [],
                      grams: null,
                      calories: null,
                      eaten: true,
                      discarded: false,
                    },
                  ],
                },
              ],
            },
          },
        },
      },
    }))

    const result = await store
      .getState()
      .deleteCustomDish(created.dishId)

    expect(result).toEqual({ status: 'removed', archived: true })
    expect(images.images.has(dish.imageId!)).toBe(true)
  })
})
