import { describe, expect, it } from 'vitest'

import { createMealDrawBudget } from '@/core/drawBudget'
import { createTokenWallet, isTokenValid } from '@/core/tokens'

import {
  APP_DATA_SCHEMA_VERSION,
  createEmptyAppData,
  ensureToday,
  migrateV1ToV2,
  normalizeAppData,
  parseAppDataJson,
  recordStampCheckIn,
  serializeAppData,
} from './appData'

const DAY_0 = '2026-10-26'
const DAY_1 = '2026-10-27'
const DAY_2 = '2026-10-28'

const profile = {
  sex: 'female',
  age: 30,
  heightCm: 165,
  weightKg: 60,
  activity: 'sedentary',
  goal: 'maintain',
} as const

function v1Meal(overrides: Record<string, unknown> = {}) {
  return {
    candidateDishIds: [],
    selectedDishId: null,
    actualGrams: {},
    calories: null,
    customRecord: null,
    budget: { baseUsed: 0, adUsed: 0, checkedIn: false },
    ...overrides,
  }
}

function v1Data(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    profile: null,
    targetCalories: null,
    pityCount: 0,
    days: {
      [DAY_1]: {
        dateKey: DAY_1,
        meals: {
          breakfast: v1Meal(),
          lunch: v1Meal(),
          dinner: v1Meal(),
        },
        tokens: { dateKey: DAY_1, count: 0, customRewardClaimed: false },
      },
    },
    stamps: {},
    settings: { showCalories: false, profileHintDismissed: false },
    ...overrides,
  }
}

function v2Component(overrides: Record<string, unknown> = {}) {
  return {
    id: 'comp:combo:white-rice:1',
    kind: 'dish',
    origin: 'combo',
    dishId: 'white_rice',
    name: '白米饭',
    category: 'staple',
    rarity: 'R',
    image: null,
    cooking: null,
    ingredients: [
      {
        ingredientId: 'cooked_rice',
        name: '米饭',
        kcalPer100g: 116,
        grams: 200,
      },
    ],
    grams: 200,
    calories: 232,
    eaten: true,
    discarded: false,
    ...overrides,
  }
}

function v2Candidate(overrides: Record<string, unknown> = {}) {
  return {
    id: 'draw:white_rice',
    comboId: 'combo_white_rice',
    source: 'draw',
    name: '白米饭套餐',
    rarity: 'R',
    components: [v2Component()],
    ...overrides,
  }
}

function v2Data(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 2,
    profile: null,
    targetCalories: null,
    pityCount: 0,
    days: {
      [DAY_1]: {
        meals: {
          breakfast: { candidateCombos: [] },
          lunch: {
            candidateCombos: [v2Candidate()],
            selectedCandidateId: 'draw:white_rice',
            calories: null,
            budget: { baseUsed: 1, adUsed: 0, checkedIn: false },
          },
          dinner: { candidateCombos: [] },
        },
        tokens: { dateKey: DAY_1, count: 0, customRewardClaimed: false },
      },
    },
    stamps: {},
    settings: { showCalories: false, profileHintDismissed: false },
    ...overrides,
  }
}

describe('AppData defaults', () => {
  it('creates today with three empty v2 meals and a fresh token wallet', () => {
    const data = createEmptyAppData(DAY_1)
    const day = data.days[DAY_1]!

    expect(APP_DATA_SCHEMA_VERSION).toBe(2)
    expect(data.schemaVersion).toBe(2)
    expect(data.profile).toBeNull()
    expect(data.targetCalories).toBeNull()
    expect(data.pityCount).toBe(0)
    expect(data.stamps).toEqual({})
    expect(data.settings).toEqual({
      showCalories: false,
      profileHintDismissed: false,
    })
    expect(Object.keys(data.days)).toEqual([DAY_1])
    expect(day.dateKey).toBe(DAY_1)
    expect(day.tokens).toEqual(createTokenWallet(DAY_1))
    expect(Object.keys(day.meals).sort()).toEqual([
      'breakfast',
      'dinner',
      'lunch',
    ])

    for (const meal of Object.values(day.meals)) {
      expect(meal).toEqual({
        candidateCombos: [],
        selectedCandidateId: null,
        calories: null,
        budget: createMealDrawBudget(),
      })
    }
  })
})

describe('ensureToday', () => {
  it('creates a new day and keeps history', () => {
    const day1 = createEmptyAppData(DAY_1)
    const withTokens = {
      ...day1,
      days: {
        ...day1.days,
        [DAY_1]: {
          ...day1.days[DAY_1]!,
          tokens: { ...day1.days[DAY_1]!.tokens, count: 2 },
        },
      },
    }

    const next = ensureToday(withTokens, DAY_2)

    expect(next).not.toBe(withTokens)
    expect(next.days[DAY_1]!.tokens.count).toBe(2)
    expect(next.days[DAY_2]).toEqual({
      dateKey: DAY_2,
      meals: next.days[DAY_2]!.meals,
      tokens: createTokenWallet(DAY_2),
    })
    expect(isTokenValid(next.days[DAY_1]!.tokens, DAY_2)).toBe(false)
    expect(Object.keys(withTokens.days)).toEqual([DAY_1])
  })

  it('keeps same-day tokens and expires stale ones', () => {
    const day1 = createEmptyAppData(DAY_1)
    const withTokens = {
      ...day1,
      days: {
        ...day1.days,
        [DAY_1]: {
          ...day1.days[DAY_1]!,
          tokens: {
            ...day1.days[DAY_1]!.tokens,
            count: 2,
            customRewardClaimed: true,
          },
        },
      },
    }

    const sameDay = ensureToday(withTokens, DAY_1)
    expect(sameDay.days[DAY_1]!.tokens.count).toBe(2)
    expect(sameDay.days[DAY_1]!.tokens.customRewardClaimed).toBe(true)

    const stale = {
      ...sameDay,
      days: {
        ...sameDay.days,
        [DAY_2]: {
          ...createEmptyAppData(DAY_2).days[DAY_2]!,
          tokens: {
            ...createTokenWallet(DAY_1),
            count: 3,
            customRewardClaimed: true,
          },
        },
      },
    }
    expect(ensureToday(stale, DAY_2).days[DAY_2]!.tokens).toEqual(
      createTokenWallet(DAY_2),
    )
  })
})

describe('stamp collection', () => {
  it('tracks count, first date, and every check-in date', () => {
    const first = recordStampCheckIn({}, 'dish_a', DAY_1)

    expect(first.dish_a).toEqual({
      checkInCount: 1,
      firstCheckInDate: DAY_1,
      checkInDates: [DAY_1],
    })

    const second = recordStampCheckIn(first, 'dish_a', DAY_1)
    const third = recordStampCheckIn(second, 'dish_a', DAY_2)

    expect(third.dish_a).toEqual({
      checkInCount: 3,
      firstCheckInDate: DAY_1,
      checkInDates: [DAY_1, DAY_1, DAY_2],
    })
    expect(first.dish_a?.checkInCount).toBe(1)
  })
})

describe('v1 → v2 migration', () => {
  it('bumps the version, dedupes candidate ids, and keeps their order', () => {
    const data = normalizeAppData(
      v1Data({
        days: {
          [DAY_1]: {
            meals: {
              lunch: v1Meal({
                candidateDishIds: ['white_rice', 'boiled_egg', 'white_rice', 42],
              }),
            },
          },
        },
      }),
      DAY_1,
    )

    const lunch = data.days[DAY_1]!.meals.lunch

    expect(data.schemaVersion).toBe(2)
    expect(lunch.candidateCombos.map((item) => item.comboId)).toEqual([
      null,
      null,
    ])
    expect(
      lunch.candidateCombos.map((item) => item.components[0]?.dishId),
    ).toEqual(['white_rice', 'boiled_egg'])
    expect(lunch.candidateCombos.map((item) => item.source)).toEqual([
      'legacy',
      'legacy',
    ])
    expect(lunch.candidateCombos.map((item) => item.id)).toEqual([
      `legacy:${DAY_1}:lunch:white_rice`,
      `legacy:${DAY_1}:lunch:boiled_egg`,
    ])
    expect(lunch.selectedCandidateId).toBeNull()
    expect(
      lunch.candidateCombos.every((item) => item.components[0]?.eaten === false),
    ).toBe(true)
  })

  it('keeps the selected dish uneaten while the meal is not checked in', () => {
    const data = normalizeAppData(
      v1Data({
        days: {
          [DAY_1]: {
            meals: {
              lunch: v1Meal({
                candidateDishIds: ['white_rice', 'boiled_egg'],
                selectedDishId: 'boiled_egg',
              }),
            },
          },
        },
      }),
      DAY_1,
    )

    const lunch = data.days[DAY_1]!.meals.lunch
    const selected = lunch.candidateCombos.find(
      (item) => item.id === lunch.selectedCandidateId,
    )

    expect(lunch.selectedCandidateId).toBe(
      `legacy:${DAY_1}:lunch:boiled_egg`,
    )
    expect(selected?.components[0]).toMatchObject({
      dishId: 'boiled_egg',
      eaten: false,
    })
  })

  it('applies actual grams to the selected dish and preserves the old calories', () => {
    const data = normalizeAppData(
      v1Data({
        days: {
          [DAY_1]: {
            meals: {
              lunch: v1Meal({
                candidateDishIds: ['white_rice'],
                selectedDishId: 'white_rice',
                actualGrams: { cooked_rice: 300, unknown: 50 },
                calories: 999,
                budget: { baseUsed: 2, adUsed: 1, checkedIn: true },
              }),
            },
          },
        },
      }),
      DAY_1,
    )

    const lunch = data.days[DAY_1]!.meals.lunch
    const component = lunch.candidateCombos[0]!.components[0]!

    expect(lunch.calories).toBe(999)
    expect(component).toMatchObject({ grams: 300, calories: 348, eaten: true })
    expect(component.ingredients[0]?.grams).toBe(300)
    expect(lunch.budget).toEqual({
      baseUsed: 2,
      adUsed: 1,
      checkedIn: true,
    })
  })

  it('appends and selects a selected dish that was missing from the pool', () => {
    const data = normalizeAppData(
      v1Data({
        days: {
          [DAY_1]: {
            meals: {
              lunch: v1Meal({
                candidateDishIds: ['white_rice'],
                selectedDishId: 'boiled_egg',
              }),
            },
          },
        },
      }),
      DAY_1,
    )

    const lunch = data.days[DAY_1]!.meals.lunch

    expect(
      lunch.candidateCombos.map((item) => item.components[0]?.dishId),
    ).toEqual(['white_rice', 'boiled_egg'])
    expect(lunch.selectedCandidateId).toBe(
      `legacy:${DAY_1}:lunch:boiled_egg`,
    )
  })

  it('keeps a placeholder snapshot when the old dish no longer exists', () => {
    const data = normalizeAppData(
      v1Data({
        days: {
          [DAY_1]: {
            meals: {
              lunch: v1Meal({
                candidateDishIds: ['ghost_dish'],
                selectedDishId: 'ghost_dish',
                calories: 500,
              }),
            },
          },
        },
      }),
      DAY_1,
    )

    const lunch = data.days[DAY_1]!.meals.lunch
    const component = lunch.candidateCombos[0]!.components[0]!

    expect(component).toMatchObject({
      dishId: 'ghost_dish',
      name: 'ghost_dish',
      category: 'snack',
      ingredients: [],
      grams: null,
      calories: null,
    })
    expect(lunch.calories).toBe(500)
    expect(lunch.selectedCandidateId).toBe(`legacy:${DAY_1}:lunch:ghost_dish`)
  })

  it('migrates a custom-only meal into a selected custom candidate', () => {
    const data = normalizeAppData(
      v1Data({
        days: {
          [DAY_1]: {
            meals: {
              lunch: v1Meal({
                customRecord: { name: '  朋友聚餐  ', calories: 800.4 },
              }),
            },
          },
        },
      }),
      DAY_1,
    )

    const lunch = data.days[DAY_1]!.meals.lunch
    const custom = lunch.candidateCombos[0]!

    expect(lunch.candidateCombos).toHaveLength(1)
    expect(lunch.selectedCandidateId).toBe(`legacy:${DAY_1}:lunch:custom`)
    expect(custom.id).toBe(`legacy:${DAY_1}:lunch:custom`)
    expect(custom.components[0]).toMatchObject({
      kind: 'custom',
      name: '朋友聚餐',
      calories: 800,
      eaten: true,
    })
    expect(lunch.calories).toBe(800)
    expect(lunch.budget.checkedIn).toBe(true)
    expect(data.stamps).toEqual({})
    expect(data.days[DAY_1]!.tokens).toEqual(createTokenWallet(DAY_1))
  })

  it('keeps null calories for a custom-only record', () => {
    const data = normalizeAppData(
      v1Data({
        days: {
          [DAY_1]: {
            meals: {
              lunch: v1Meal({ customRecord: { name: '夜宵' } }),
            },
          },
        },
      }),
      DAY_1,
    )

    const lunch = data.days[DAY_1]!.meals.lunch
    expect(lunch.calories).toBeNull()
    expect(lunch.candidateCombos[0]!.components[0]?.calories).toBeNull()
  })

  it('prefers the custom record over an old selected dish', () => {
    const data = normalizeAppData(
      v1Data({
        days: {
          [DAY_1]: {
            meals: {
              lunch: v1Meal({
                candidateDishIds: ['white_rice'],
                selectedDishId: 'white_rice',
                customRecord: { name: '奶茶', calories: 300 },
                budget: { baseUsed: 1, adUsed: 0, checkedIn: true },
              }),
            },
          },
        },
      }),
      DAY_1,
    )

    const lunch = data.days[DAY_1]!.meals.lunch
    const dishCandidate = lunch.candidateCombos.find(
      (item) => item.components[0]?.dishId === 'white_rice',
    )!

    expect(lunch.candidateCombos).toHaveLength(2)
    expect(lunch.selectedCandidateId).toBe(`legacy:${DAY_1}:lunch:custom`)
    expect(lunch.calories).toBe(300)
    expect(dishCandidate.components[0]?.eaten).toBe(false)
    expect(lunch.budget.checkedIn).toBe(true)
  })

  it('preserves tokens, stamps, pity, profile, and explicit settings', () => {
    const data = normalizeAppData(
      v1Data({
        profile,
        targetCalories: 999,
        pityCount: 4,
        days: {
          [DAY_1]: {
            meals: { lunch: v1Meal() },
            tokens: {
              dateKey: DAY_1,
              count: 2,
              customRewardClaimed: true,
            },
          },
        },
        stamps: {
          white_rice: {
            checkInCount: 3,
            firstCheckInDate: DAY_0,
            checkInDates: [DAY_0, DAY_0, DAY_0],
          },
        },
        settings: { showCalories: false, profileHintDismissed: false },
      }),
      DAY_1,
    )

    expect(data.profile).toEqual(profile)
    expect(data.targetCalories).toBe(1584)
    expect(data.pityCount).toBe(4)
    expect(data.stamps.white_rice?.checkInCount).toBe(3)
    expect(data.stamps.white_rice?.checkInDates).toEqual([DAY_0, DAY_0, DAY_0])
    expect(data.days[DAY_1]!.tokens.count).toBe(2)
    expect(data.days[DAY_1]!.tokens.customRewardClaimed).toBe(true)
    expect(data.settings).toEqual({
      showCalories: false,
      profileHintDismissed: false,
    })
  })

  it('is idempotent and does not re-migrate v2 data', () => {
    const raw = v1Data({
      days: {
        [DAY_1]: {
          meals: { lunch: v1Meal({ candidateDishIds: ['white_rice'] }) },
        },
      },
    })

    const once = migrateV1ToV2(raw)
    const twice = migrateV1ToV2(once)

    expect(twice).toEqual(once)
    expect(once.schemaVersion).toBe(2)

    const again = normalizeAppData(once, DAY_1)
    expect(normalizeAppData(again, DAY_1)).toEqual(again)

    const v2Raw = v2Data()
    expect(migrateV1ToV2(v2Raw)).toBe(v2Raw)
  })

  it('imports legacy JSON through parseAppDataJson', () => {
    const raw = v1Data({
      days: {
        [DAY_1]: {
          meals: {
            lunch: v1Meal({
              candidateDishIds: ['white_rice'],
              selectedDishId: 'white_rice',
              budget: { baseUsed: 1, adUsed: 0, checkedIn: true },
            }),
          },
          tokens: { dateKey: DAY_1, count: 1, customRewardClaimed: false },
        },
      },
    })

    expect(parseAppDataJson(JSON.stringify(raw), DAY_1)).toEqual(
      normalizeAppData(raw, DAY_1),
    )
  })
})

describe('v2 normalization', () => {
  it('round-trips a v2 snapshot', () => {
    const data = normalizeAppData(v2Data(), DAY_1)

    expect(data.days[DAY_1]!.meals.lunch.candidateCombos).toHaveLength(1)
    expect(parseAppDataJson(serializeAppData(data), DAY_1)).toEqual(data)
  })

  it('drops duplicate and invalid candidates, and clears a stale selection', () => {
    const data = normalizeAppData(
      v2Data({
        days: {
          [DAY_1]: {
            meals: {
              lunch: {
                candidateCombos: [
                  v2Candidate(),
                  v2Candidate(),
                  { id: 'bad', name: '缺少字段' },
                  v2Candidate({ id: 'empty', components: [] }),
                ],
                selectedCandidateId: 'not_in_pool',
              },
            },
          },
        },
      }),
      DAY_1,
    )

    const lunch = data.days[DAY_1]!.meals.lunch

    expect(lunch.candidateCombos.map((item) => item.id)).toEqual([
      'draw:white_rice',
    ])
    expect(lunch.selectedCandidateId).toBeNull()
  })

  it('normalizes component fields and filters invalid ones', () => {
    const data = normalizeAppData(
      v2Data({
        days: {
          [DAY_1]: {
            meals: {
              lunch: {
                candidateCombos: [
                  v2Candidate({
                    components: [
                      v2Component({
                        id: 'a',
                        category: 'not_a_category',
                        image: 42,
                        cooking: { method: '飞', timeMinutes: 1, steps: [] },
                        grams: -1,
                        calories: -1,
                        ingredients: [
                          { name: '好的', kcalPer100g: 10, grams: 10 },
                          { name: '坏热量', kcalPer100g: 'x', grams: 10 },
                          { name: '', kcalPer100g: 10, grams: 10 },
                          { name: '坏克数', kcalPer100g: 10, grams: -1 },
                        ],
                        eaten: 'yes',
                        discarded: true,
                      }),
                      v2Component({ id: 'a' }),
                      v2Component({ id: '' }),
                      {
                        id: 'c',
                        kind: 'custom',
                        origin: 'custom',
                        name: '奶茶',
                        rarity: 'R',
                        calories: -5,
                      },
                    ],
                  }),
                ],
              },
            },
          },
        },
      }),
      DAY_1,
    )

    const components =
      data.days[DAY_1]!.meals.lunch.candidateCombos[0]!.components

    expect(components.map((item) => item.id)).toEqual(['a', 'c'])

    const dish = components[0]!
    expect(dish).toMatchObject({
      category: null,
      image: null,
      cooking: null,
      grams: null,
      calories: null,
      eaten: true,
      discarded: true,
      ingredients: [{ name: '好的', kcalPer100g: 10, grams: 10 }],
    })

    expect(components[1]).toMatchObject({
      kind: 'custom',
      dishId: null,
      category: null,
      ingredients: [],
      grams: null,
      calories: null,
      eaten: true,
      discarded: false,
    })
  })

  it('normalizes budget and meal calories', () => {
    const data = normalizeAppData(
      v2Data({
        days: {
          [DAY_1]: {
            meals: {
              lunch: {
                candidateCombos: [v2Candidate()],
                selectedCandidateId: 'draw:white_rice',
                calories: 500,
                budget: { baseUsed: -1, adUsed: 2.5, checkedIn: 'yes' },
              },
            },
          },
        },
      }),
      DAY_1,
    )

    const lunch = data.days[DAY_1]!.meals.lunch
    expect(lunch.calories).toBe(500)
    expect(lunch.budget).toEqual({
      baseUsed: 0,
      adUsed: 0,
      checkedIn: false,
    })
  })
})

describe('versioning and settings', () => {
  it('recomputes target calories from a valid profile', () => {
    const data = normalizeAppData(
      {
        schemaVersion: APP_DATA_SCHEMA_VERSION,
        profile,
        targetCalories: 999,
        days: {},
        stamps: {},
      },
      DAY_1,
    )

    expect(data.targetCalories).toBe(1584)
    expect(data.profile).toEqual(profile)
    expect(data.days[DAY_1]).toBeDefined()
  })

  it('rejects invalid JSON and unsupported versions', () => {
    expect(() => parseAppDataJson('{not json', DAY_1)).toThrow(
      '不是合法的 JSON',
    )
    expect(() => normalizeAppData({}, DAY_1)).toThrow('schemaVersion')

    for (const version of [3, 99]) {
      expect(() =>
        normalizeAppData({ schemaVersion: version }, DAY_1),
      ).toThrow('高于当前支持')
    }
  })

  it('fills default settings for legacy data', () => {
    const legacyGuest = normalizeAppData(
      {
        schemaVersion: APP_DATA_SCHEMA_VERSION,
        days: {},
        stamps: {},
      },
      DAY_1,
    )
    expect(legacyGuest.settings).toEqual({
      showCalories: false,
      profileHintDismissed: false,
    })

    const legacyProfile = normalizeAppData(
      {
        schemaVersion: APP_DATA_SCHEMA_VERSION,
        profile,
        targetCalories: 999,
        days: {},
        stamps: {},
      },
      DAY_1,
    )
    expect(legacyProfile.settings).toEqual({
      showCalories: true,
      profileHintDismissed: true,
    })
  })

  it('keeps explicit settings while forcing calories off without a profile', () => {
    const withProfile = normalizeAppData(
      {
        schemaVersion: APP_DATA_SCHEMA_VERSION,
        profile,
        settings: { showCalories: false, profileHintDismissed: false },
        days: {},
        stamps: {},
      },
      DAY_1,
    )
    expect(withProfile.settings).toEqual({
      showCalories: false,
      profileHintDismissed: false,
    })

    const guest = normalizeAppData(
      {
        schemaVersion: APP_DATA_SCHEMA_VERSION,
        targetCalories: 1600,
        settings: { showCalories: true, profileHintDismissed: true },
        days: {},
        stamps: {},
      },
      DAY_1,
    )
    expect(guest.profile).toBeNull()
    expect(guest.settings.showCalories).toBe(false)
    expect(guest.settings.profileHintDismissed).toBe(true)
  })

  it('rejects invalid profile, count, and date keys', () => {
    expect(() =>
      normalizeAppData(
        {
          schemaVersion: APP_DATA_SCHEMA_VERSION,
          profile: { ...profile, age: 0 },
          days: {},
          stamps: {},
        },
        DAY_1,
      ),
    ).toThrow('profile.age')

    expect(() =>
      normalizeAppData(
        {
          schemaVersion: APP_DATA_SCHEMA_VERSION,
          pityCount: -1,
          days: {},
          stamps: {},
        },
        DAY_1,
      ),
    ).toThrow('pityCount')

    expect(() =>
      normalizeAppData(
        {
          schemaVersion: APP_DATA_SCHEMA_VERSION,
          days: { '2026-02-30': {} },
          stamps: {},
        },
        DAY_1,
      ),
    ).toThrow('无效的日期键')
  })
})

function customDish(overrides: Record<string, unknown> = {}) {
  return {
    id: 'custom_dish:a',
    name: '番茄炒蛋',
    imageId: 'img:1',
    emoji: '🍅',
    category: 'main',
    meals: ['lunch', 'dinner'],
    rarity: 'SR',
    ingredientRows: [
      { ingredientId: 'tomato', name: '番茄', kcalPer100g: 20, grams: 200 },
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

describe('custom dish normalization', () => {
  it('fills empty custom collections for older v2 data', () => {
    const data = normalizeAppData(v2Data(), DAY_1)

    expect(data.customIngredients).toEqual([])
    expect(data.customDishes).toEqual([])
  })

  it('keeps valid custom ingredients and custom dishes', () => {
    const data = normalizeAppData(
      v2Data({
        customIngredients: [
          { id: 'custom_ingredient:a', name: ' 自制酱 ', kcalPer100g: 90 },
        ],
        customDishes: [customDish()],
      }),
      DAY_1,
    )

    expect(data.customIngredients).toEqual([
      { id: 'custom_ingredient:a', name: '自制酱', kcalPer100g: 90 },
    ])
    expect(data.customDishes).toHaveLength(1)
    expect(data.customDishes[0]).toMatchObject({
      id: 'custom_dish:a',
      name: '番茄炒蛋',
      imageId: 'img:1',
      emoji: '🍅',
      meals: ['lunch', 'dinner'],
      rarity: 'SR',
      calorieMode: 'ingredients',
      calories: null,
      includeInPool: true,
      archived: false,
      createdAt: DAY_1,
    })
  })

  it('drops invalid and duplicate custom entries', () => {
    const data = normalizeAppData(
      v2Data({
        customIngredients: [
          { id: 'a', name: '', kcalPer100g: 10 },
          { id: 'b', name: '好', kcalPer100g: 'x' },
          { id: 'c', name: '好', kcalPer100g: 10 },
          { id: 'c', name: '重复', kcalPer100g: 20 },
        ],
        customDishes: [
          customDish(),
          customDish({ name: '重复 id' }),
          customDish({ id: 'custom_dish:b', name: '' }),
          customDish({ id: 'custom_dish:c', category: 'unknown' }),
          customDish({ id: 'custom_dish:d', meals: ['brunch'] }),
        ],
      }),
      DAY_1,
    )

    expect(data.customIngredients.map((item) => item.id)).toEqual(['c'])
    expect(data.customDishes.map((dish) => dish.id)).toEqual(['custom_dish:a'])
  })

  it('clamps rarity to the allowed list and validates calorie fields', () => {
    const data = normalizeAppData(
      v2Data({
        customDishes: [
          customDish({ rarity: 'UR' }),
          customDish({
            id: 'custom_dish:total',
            calorieMode: 'total',
            calories: 480.6,
            ingredientRows: [],
          }),
          customDish({
            id: 'custom_dish:bad-total',
            calorieMode: 'total',
            calories: null,
          }),
          customDish({
            id: 'custom_dish:rows',
            ingredientRows: [
              { name: '坏克数', kcalPer100g: 10, grams: 0 },
              { name: '', kcalPer100g: 10, grams: 10 },
              { name: '保留', kcalPer100g: 10, grams: 10 },
            ],
          }),
        ],
      }),
      DAY_1,
    )

    const byId = new Map(data.customDishes.map((dish) => [dish.id, dish]))

    expect(byId.get('custom_dish:a')?.rarity).toBe('R')
    expect(byId.get('custom_dish:total')).toMatchObject({
      calorieMode: 'total',
      calories: 481,
    })
    expect(byId.get('custom_dish:bad-total')).toMatchObject({
      calorieMode: 'ingredients',
      calories: null,
    })
    expect(byId.get('custom_dish:rows')?.ingredientRows).toEqual([
      { name: '保留', kcalPer100g: 10, grams: 10 },
    ])
  })

  it('forces archived dishes out of the pool', () => {
    const data = normalizeAppData(
      v2Data({
        customDishes: [customDish({ archived: true, includeInPool: true })],
      }),
      DAY_1,
    )

    expect(data.customDishes[0]).toMatchObject({
      archived: true,
      includeInPool: false,
    })
  })

  it('drops cooking guides that break the form rules', () => {
    const data = normalizeAppData(
      v2Data({
        customDishes: [
          customDish({
            id: 'custom_dish:ok',
            cooking: { method: '炒', timeMinutes: 10, steps: ['一', '二', '三'] },
          }),
          customDish({
            id: 'custom_dish:few-steps',
            cooking: { method: '炒', timeMinutes: 10, steps: ['一', '二'] },
          }),
          customDish({
            id: 'custom_dish:long-step',
            cooking: {
              method: '炒',
              timeMinutes: 10,
              steps: ['一', '二', '三字'.repeat(20)],
            },
          }),
          customDish({
            id: 'custom_dish:slow',
            cooking: { method: '炖', timeMinutes: 301, steps: ['一', '二', '三'] },
          }),
        ],
      }),
      DAY_1,
    )

    const byId = new Map(data.customDishes.map((dish) => [dish.id, dish]))

    expect(byId.get('custom_dish:ok')?.cooking?.steps).toEqual(['一', '二', '三'])
    expect(byId.get('custom_dish:few-steps')?.cooking).toBeNull()
    expect(byId.get('custom_dish:long-step')?.cooking).toBeNull()
    expect(byId.get('custom_dish:slow')?.cooking).toBeNull()
  })

  it('keeps image ids on history snapshots through a JSON round trip', () => {
    const data = normalizeAppData(
      v2Data({
        days: {
          [DAY_1]: {
            meals: {
              lunch: {
                candidateCombos: [
                  v2Candidate({
                    components: [v2Component({ imageId: 'img:history' })],
                  }),
                ],
              },
            },
          },
        },
      }),
      DAY_1,
    )

    const component =
      data.days[DAY_1]!.meals.lunch.candidateCombos[0]!.components[0]!

    expect(component.imageId).toBe('img:history')
    expect(parseAppDataJson(serializeAppData(data), DAY_1)).toEqual(data)
  })
})
