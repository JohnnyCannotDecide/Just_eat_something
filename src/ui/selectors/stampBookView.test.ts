import { describe, expect, it } from 'vitest'

import type { CustomDish, Dish } from '@/core/types'
import type { StampRecord } from '@/storage/appData'

import { buildStampBookView } from './stampBookView'

const DAY_1 = '2026-10-20'
const DAY_2 = '2026-10-28'

function makeRecord(
  checkInCount: number,
  checkInDates: string[] = Array.from(
    { length: Math.max(0, Math.floor(checkInCount)) },
    () => DAY_2,
  ),
  firstCheckInDate: string = checkInDates[0] ?? '',
): StampRecord {
  return { checkInCount, firstCheckInDate, checkInDates }
}

function entryOf(view: ReturnType<typeof buildStampBookView>, id: string) {
  const entry = view.entries.find((item) => item.id === id)
  if (!entry) {
    throw new Error(`missing entry ${id}`)
  }
  return entry
}

describe('buildStampBookView', () => {
  it('lists every canonical dish as uncollected on an empty book', () => {
    const view = buildStampBookView({})

    expect(view.total).toBe(94)
    expect(view.entries).toHaveLength(94)
    expect(view.collected).toBe(0)
    expect(view.percent).toBe(0)

    for (const entry of view.entries) {
      expect(entry.collected).toBe(false)
      expect(entry.masked).toBe(true)
      expect(entry.name).toBe('???')
      expect(entry.count).toBe(0)
      expect(entry.tier).toBeNull()
      expect(entry.tierLabel).toBeNull()
      expect(entry.nextTier).toBe('bronze')
      expect(entry.remainingToNext).toBe(1)
      expect(entry.firstCheckInDate).toBe('')
      expect(entry.firstCheckInLabel).toBe('')
      expect(entry.dateLabel).toBe('')
    }
  })

  it('strips every leaky field from uncollected official dishes', () => {
    const view = buildStampBookView({})
    const rice = entryOf(view, 'white_rice')

    expect(rice.masked).toBe(true)
    expect(rice.name).toBe('???')
    expect(rice.emoji).toBe('')
    expect(rice.image).toBe('')
    expect(rice.imageId).toBeUndefined()
    expect(rice.stampImage).toBeUndefined()
    expect(rice.kcal).toBeNull()
    expect(rice.tip).toBeUndefined()
    expect(rice.ingredients).toEqual([])
    expect(rice.cooking).toBeNull()
    // 类别与稀有度用于剪影上的色环和类别图标，不属于剧透。
    expect(rice.rarity).toBe('R')
    expect(rice.category).toBe('staple')

    const serialized = JSON.stringify(view)
    expect(serialized).not.toContain('白米饭')
    expect(serialized).not.toContain('朴素但可靠的碳水老朋友')
    expect(serialized).not.toContain('米饭')
  })

  it.each([
    [1, 'bronze', '铜', 'silver', 2],
    [3, 'silver', '银', 'gold', 4],
    [7, 'gold', '金', null, null],
  ] as const)(
    'maps %i check-ins to the %s tier',
    (count, tier, tierLabel, nextTier, remainingToNext) => {
      const view = buildStampBookView({
        stamps: { white_rice: makeRecord(count) },
      })
      const entry = entryOf(view, 'white_rice')

      expect(entry.collected).toBe(true)
      expect(entry.masked).toBe(false)
      expect(entry.name).toBe('白米饭')
      expect(entry.count).toBe(count)
      expect(entry.tier).toBe(tier)
      expect(entry.tierLabel).toBe(tierLabel)
      expect(entry.nextTier).toBe(nextTier)
      expect(entry.remainingToNext).toBe(remainingToNext)
      expect(view.collected).toBe(1)
      expect(view.percent).toBe(1)
    },
  )

  it('ignores stamp IDs that are not part of the dish catalog', () => {
    const view = buildStampBookView({
      stamps: {
        'not-a-dish': makeRecord(4),
        white_rice: makeRecord(1),
      },
    })

    expect(view.entries.map((entry) => entry.id)).not.toContain('not-a-dish')
    expect(view.collected).toBe(1)
    expect(view.percent).toBe(1)
  })

  it('treats zero or malformed counts as uncollected', () => {
    const view = buildStampBookView({
      stamps: {
        white_rice: makeRecord(0, [], ''),
        tomato_egg: makeRecord(Number.NaN),
        boiled_egg: makeRecord(-3),
        oatmeal_milk: makeRecord(2.9),
      },
    })

    expect(entryOf(view, 'white_rice').collected).toBe(false)
    expect(entryOf(view, 'tomato_egg').collected).toBe(false)
    expect(entryOf(view, 'boiled_egg').collected).toBe(false)

    const fractional = entryOf(view, 'oatmeal_milk')
    expect(fractional.collected).toBe(true)
    expect(fractional.count).toBe(2)
    expect(view.collected).toBe(1)
  })

  it('keeps the first date, the latest date, and their labels', () => {
    const view = buildStampBookView({
      stamps: {
        white_rice: makeRecord(
          3,
          [DAY_1, '2026-10-24', DAY_2],
          DAY_1,
        ),
      },
    })
    const entry = entryOf(view, 'white_rice')

    expect(entry.firstCheckInDate).toBe(DAY_1)
    expect(entry.firstCheckInLabel).toBe('10月20日 · 周二')
    expect(entry.latestCheckInDate).toBe(DAY_2)
    expect(entry.dateLabel).toBe('10.28')
  })

  it('falls back to the first date when no check-in dates are stored', () => {
    const view = buildStampBookView({
      stamps: { white_rice: makeRecord(3, [], DAY_1) },
    })
    const entry = entryOf(view, 'white_rice')

    expect(entry.latestCheckInDate).toBe(DAY_1)
    expect(entry.dateLabel).toBe('10.20')
  })

  it('derives calories, ingredients, emoji, and stamp image from the dish', () => {
    const view = buildStampBookView({
      stamps: { white_rice: makeRecord(1) },
    })
    const rice = entryOf(view, 'white_rice')

    expect(rice.masked).toBe(false)

    expect(rice.name).toBe('白米饭')
    expect(rice.rarity).toBe('R')
    expect(rice.emoji).toBe('🍚')
    expect(rice.image).toBe('/images/dishes/white_rice.png')
    expect(rice.stampImage).toBeUndefined()
    expect(rice.kcal).toBe(232)
    expect(rice.ingredients).toEqual([
      {
        id: 'cooked_rice',
        name: '米饭',
        grams: 200,
        kcalPer100g: 116,
      },
    ])
    expect(rice.tip).toBe('朴素但可靠的碳水老朋友。')

    const dishSource: Dish[] = [
      {
        id: 'white_rice',
        name: '白米饭',
        rarity: 'R',
        category: 'staple',
        meals: ['lunch', 'dinner'],
        ingredients: [],
        image: '/images/dishes/white_rice.png',
        stampImage: '/images/stamps/white_rice.png',
        cooking: { method: '煮', timeMinutes: 0, steps: [] },
      },
    ]
    const withStamp = buildStampBookView(
      { stamps: { white_rice: makeRecord(1) } },
      'all',
      dishSource,
    )

    expect(withStamp.total).toBe(1)
    expect(withStamp.entries[0]!.masked).toBe(false)
    expect(withStamp.entries[0]!.stampImage).toBe(
      '/images/stamps/white_rice.png',
    )
  })

  it('rounds the collection percentage against the provided catalog', () => {
    const view = buildStampBookView({
      stamps: {
        white_rice: makeRecord(1),
        tomato_egg: makeRecord(3),
        boiled_egg: makeRecord(7),
      },
    })

    expect(view.collected).toBe(3)
    expect(view.total).toBe(94)
    expect(view.percent).toBe(3)
  })
})

function customDish(overrides: Partial<CustomDish> = {}): CustomDish {
  return {
    id: 'custom_dish:a',
    name: '番茄炒蛋',
    imageId: 'img:a',
    emoji: '🍅',
    category: 'main',
    meals: ['lunch', 'dinner'],
    rarity: 'R',
    ingredientRows: [
      { ingredientId: 'tomato', name: '番茄', kcalPer100g: 20, grams: 200 },
      { name: '鸡蛋', kcalPer100g: 144, grams: 50 },
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

describe('buildStampBookView · custom dishes and filters', () => {
  it('lists official dishes first, then custom dishes', () => {
    const view = buildStampBookView({
      customDishes: [customDish()],
    })

    expect(view.total).toBe(94)
    expect(view.customTotal).toBe(1)
    expect(view.entries).toHaveLength(95)
    expect(view.entries.at(-1)!.id).toBe('custom_dish:a')
  })

  it('maps custom dish fields without depending on the official catalog', () => {
    const entry = entryOf(
      buildStampBookView({ customDishes: [customDish()] }),
      'custom_dish:a',
    )

    expect(entry.name).toBe('番茄炒蛋')
    expect(entry.emoji).toBe('🍅')
    expect(entry.image).toBe('')
    expect(entry.imageId).toBe('img:a')
    expect(entry.isCustom).toBe(true)
    expect(entry.masked).toBe(false)
    expect(entry.archived).toBe(false)
    expect(entry.kcal).toBe(Math.round(40 + 72))
    expect(entry.cooking).toBeNull()
    expect(entry.ingredients).toEqual([
      { id: 'tomato', name: '番茄', grams: 200, kcalPer100g: 20 },
      {
        id: 'custom_dish:a:ingredient:2',
        name: '鸡蛋',
        grams: 50,
        kcalPer100g: 144,
      },
    ])
  })

  it('counts official progress separately and includes archived custom dishes', () => {
    const view = buildStampBookView({
      stamps: {
        white_rice: makeRecord(1),
        'custom_dish:a': makeRecord(3),
      },
      customDishes: [
        customDish(),
        customDish({
          id: 'custom_dish:b',
          name: '旧菜',
          archived: true,
          includeInPool: false,
        }),
      ],
    })

    expect(view.collected).toBe(1)
    expect(view.total).toBe(94)
    expect(view.percent).toBe(1)
    expect(view.customTotal).toBe(2)
    expect(view.customCollected).toBe(1)
    expect(entryOf(view, 'custom_dish:b').archived).toBe(true)
  })

  it('filters to collected official dishes only', () => {
    const view = buildStampBookView(
      {
        stamps: {
          white_rice: makeRecord(1),
          'custom_dish:a': makeRecord(1),
        },
        customDishes: [customDish()],
      },
      'collected',
    )

    expect(view.entries.map((entry) => entry.id)).toEqual(['white_rice'])
    expect(view.entries[0]!.isCustom).toBe(false)
  })

  it('never masks custom dishes, even when uncollected and archived', () => {
    const entry = entryOf(
      buildStampBookView({
        customDishes: [
          customDish(),
          customDish({ id: 'custom_dish:b', archived: true }),
        ],
      }),
      'custom_dish:b',
    )

    expect(entry.masked).toBe(false)
    expect(entry.name).toBe('番茄炒蛋')
    expect(entry.archived).toBe(true)
    expect(entry.kcal).not.toBeNull()
    expect(entry.ingredients.length).toBeGreaterThan(0)
  })

  it('searches only collected official dishes and custom dishes', () => {
    const input = {
      stamps: { white_rice: makeRecord(1) },
      customDishes: [
        customDish(),
        customDish({
          id: 'custom_dish:b',
          name: '旧菜',
          archived: true,
        }),
      ],
    }

    // 已收集官方菜可以搜到。
    expect(
      buildStampBookView(input, 'all', undefined, '白米').entries.map(
        (entry) => entry.id,
      ),
    ).toEqual(['white_rice'])

    // 未收集官方菜即使输入真实菜名也搜不到。
    expect(
      buildStampBookView(input, 'all', undefined, '番茄炒蛋').entries.map(
        (entry) => entry.id,
      ),
    ).toEqual(['custom_dish:a'])
    expect(
      buildStampBookView(input, 'all', undefined, '番茄').entries.map(
        (entry) => entry.id,
      ),
    ).toEqual(['custom_dish:a'])

    // 未收集官方菜的真实名称不再存在于视图中。
    expect(
      buildStampBookView(input, 'all', undefined, '土豆').entries,
    ).toEqual([])
    expect(
      buildStampBookView(input, 'all', undefined, '???').entries,
    ).toEqual([])

    // 归档自制菜仍然可搜。
    expect(
      buildStampBookView(input, 'all', undefined, '旧菜').entries.map(
        (entry) => entry.id,
      ),
    ).toEqual(['custom_dish:b'])

    // 空查询不改列表。
    expect(buildStampBookView(input, 'all', undefined, '').entries).toHaveLength(
      96,
    )

    // 搜索不影响进度总数。
    const searched = buildStampBookView(input, 'all', undefined, '白米')
    expect(searched.collected).toBe(1)
    expect(searched.total).toBe(94)
  })

  it('combines the filter with the search query', () => {
    const view = buildStampBookView(
      {
        stamps: { white_rice: makeRecord(1) },
        customDishes: [customDish()],
      },
      'collected',
      undefined,
      '番茄',
    )

    expect(view.entries).toEqual([])
  })

  it('filters to custom dishes, including archived ones', () => {
    const view = buildStampBookView(
      {
        customDishes: [
          customDish(),
          customDish({ id: 'custom_dish:b', archived: true }),
        ],
      },
      'custom',
    )

    expect(view.entries.map((entry) => entry.id)).toEqual([
      'custom_dish:a',
      'custom_dish:b',
    ])
    expect(view.total).toBe(94)
  })
})
