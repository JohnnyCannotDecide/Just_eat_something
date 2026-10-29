import { describe, expect, it } from 'vitest'

import { createCheckInEvent } from '@/core/checkinEvents'
import type { BodyProfile, CustomDish } from '@/core/types'
import {
  createDailyRecord,
  createEmptyAppData,
  createMealRecord,
  normalizeAppData,
} from '@/storage/appData'
import type { AppData } from '@/storage/appData'
import {
  canonicalRecords,
  isEffectivelyEmpty,
  joinCanonicalRecords,
} from './canonical'

const TODAY = '2026-10-29'

const PROFILE: BodyProfile = {
  sex: 'female',
  age: 30,
  heightCm: 165,
  weightKg: 55,
  activity: 'light',
  goal: 'maintain',
}

function makeDish(): CustomDish {
  return {
    id: 'custom_dish:1',
    name: '番茄炒蛋',
    imageId: null,
    emoji: '🍅',
    category: 'main',
    meals: ['lunch'],
    rarity: 'R',
    ingredientRows: [
      { ingredientId: 'ing1', name: '鸡蛋', kcalPer100g: 143, grams: 100 },
    ],
    calorieMode: 'ingredients',
    calories: null,
    cooking: null,
    includeInPool: true,
    archived: false,
    createdAt: '2026-10-01',
  }
}

function makeData(): AppData {
  const base = createEmptyAppData(TODAY)
  const day = createDailyRecord(TODAY)
  const lunch = createMealRecord()
  lunch.calories = 520
  day.meals.lunch = lunch

  return normalizeAppData(
    {
      ...base,
      profile: PROFILE,
      targetCalories: 1800,
      pityCount: 2,
      days: { [TODAY]: day },
      checkinEvents: [
        createCheckInEvent('dish-1', TODAY, 1000, 'event-1'),
      ],
      customIngredients: [
        { id: 'ing1', name: '鸡蛋', kcalPer100g: 143 },
      ],
      customDishes: [makeDish()],
    },
    TODAY,
  )
}

describe('canonicalRecords', () => {
  it('把一天拆成三餐 + meta，且不同步 stamps/schemaVersion', () => {
    const records = canonicalRecords(makeData())
    expect(records.has(`days/${TODAY}/breakfast`)).toBe(true)
    expect(records.has(`days/${TODAY}/lunch`)).toBe(true)
    expect(records.has(`days/${TODAY}/dinner`)).toBe(true)
    expect(records.get(`days/${TODAY}/meta`)?.data).toEqual({
      dateKey: TODAY,
      tokens: expect.objectContaining({ dateKey: TODAY }),
    })
    expect(records.has('stamps/dish-1')).toBe(false)
    expect([...records.keys()].some((key) => key.includes('schemaVersion'))).toBe(
      false,
    )
  })

  it('profile 记录同时携带手动目标热量', () => {
    const records = canonicalRecords(makeData())
    // normalizeAppData 会按档案重算目标热量，这里同步的是最终生效值。
    expect(records.get('meta/profile')?.data).toEqual({
      profile: PROFILE,
      targetCalories: 1747,
    })
  })

  it('打卡事件逐条同步', () => {
    const records = canonicalRecords(makeData())
    expect(records.has('checkins/event-1')).toBe(true)
  })
})

describe('joinCanonicalRecords', () => {
  it('投影再组装后内容一致，stamps 由事件重建', () => {
    const data = makeData()
    const joined = joinCanonicalRecords(
      canonicalRecords(data).values(),
      TODAY,
    )

    const before = canonicalRecords(data)
    const after = canonicalRecords(joined)
    expect([...after.keys()].sort()).toEqual([...before.keys()].sort())
    for (const [key, record] of before) {
      expect(after.get(key)?.data).toEqual(record.data)
    }
    expect(joined.stamps['dish-1']?.checkInCount).toBe(1)
  })

  it('两台设备同一天各改一餐时两餐都保留', () => {
    const local = canonicalRecords(createEmptyAppData(TODAY))
    const lunch = createMealRecord()
    lunch.calories = 400
    const cloud = canonicalRecords(
      normalizeAppData(
        {
          ...createEmptyAppData(TODAY),
          days: {
            [TODAY]: {
              ...createDailyRecord(TODAY),
              meals: {
                ...createDailyRecord(TODAY).meals,
                lunch,
              },
            },
          },
        },
        TODAY,
      ),
    )

    const merged = new Map(local)
    merged.set(`days/${TODAY}/lunch`, cloud.get(`days/${TODAY}/lunch`)!)
    merged.set(`days/${TODAY}/dinner`, cloud.get(`days/${TODAY}/dinner`)!)

    const joined = joinCanonicalRecords(merged.values(), TODAY)
    expect(joined.days[TODAY]?.meals.lunch.calories).toBe(400)
  })

  it('缺少部分餐次时用空餐补全', () => {
    const joined = joinCanonicalRecords(
      [
        {
          collection: 'days',
          id: `${TODAY}/meta`,
          data: { dateKey: TODAY, tokens: { dateKey: TODAY, count: 1, customRewardClaimed: false } },
        },
      ],
      TODAY,
    )
    expect(joined.days[TODAY]?.meals.breakfast.calories).toBeNull()
    expect(joined.days[TODAY]?.tokens.count).toBe(1)
  })

  it('未知集合被忽略', () => {
    const joined = joinCanonicalRecords(
      [
        {
          collection: 'mystery',
          id: 'x',
          data: { foo: 1 },
        },
      ] as never,
      TODAY,
    )
    expect(joined.days[TODAY]).toBeDefined()
  })
})

describe('isEffectivelyEmpty', () => {
  it('只有今天的空记录也算空', () => {
    expect(isEffectivelyEmpty(createEmptyAppData(TODAY))).toBe(true)
  })

  it('有档案、印章、事件或自制内容时不算空', () => {
    const base = createEmptyAppData(TODAY)
    expect(
      isEffectivelyEmpty({ ...base, profile: PROFILE }),
    ).toBe(false)
    expect(isEffectivelyEmpty({ ...base, pityCount: 1 })).toBe(false)
    expect(
      isEffectivelyEmpty({
        ...base,
        checkinEvents: [
          createCheckInEvent('dish-1', TODAY, 1, 'e1'),
        ],
      }),
    ).toBe(false)
    expect(
      isEffectivelyEmpty({
        ...base,
        customIngredients: [{ id: 'i1', name: '盐', kcalPer100g: 0 }],
      }),
    ).toBe(false)
  })

  it('已确认热量或领取奖励后不算空', () => {
    const base = createEmptyAppData(TODAY)
    const day = createDailyRecord(TODAY)
    day.tokens.count = 1
    const meal = createMealRecord()
    meal.calories = 300
    day.meals.lunch = meal

    expect(
      isEffectivelyEmpty({ ...base, days: { [TODAY]: day } }),
    ).toBe(false)
  })
})
