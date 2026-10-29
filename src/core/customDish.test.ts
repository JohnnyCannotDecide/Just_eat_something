import { describe, expect, it } from 'vitest'

import { createEmptyAppData } from '@/storage/appData'
import { createComboCandidate } from './components'
import { createMealDrawBudget } from './drawBudget'
import { checkInMeal, drawForMeal, redrawComponent } from './gameFlow'
import { createTokenWallet } from './tokens'
import type { AppData, MealRecord } from '@/storage/appData'

import {
  CUSTOM_COMBO_ID_PREFIX,
  buildDishLibrary,
  buildHiddenCombo,
  buildLibraryDish,
  calcCustomDishCalories,
  hasAnySnapshotReference,
  hasCheckInRecords,
} from './customDish'
import type {
  Combo,
  ComboCandidateSnapshot,
  CustomDish,
  Dish,
} from './types'

const DAY = '2026-10-29'

function customDish(overrides: Partial<CustomDish> = {}): CustomDish {
  return {
    id: 'custom_dish:a',
    name: '番茄炒蛋',
    imageId: null,
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
    createdAt: DAY,
    ...overrides,
  }
}

function component(dishId: string | null, imageId?: string) {
  return {
    id: `comp:${dishId ?? 'custom'}`,
    kind: 'dish' as const,
    origin: 'combo' as const,
    dishId,
    name: '部件',
    category: 'main' as const,
    rarity: 'R' as const,
    image: '🍅',
    ...(imageId ? { imageId } : {}),
    cooking: null,
    ingredients: [],
    grams: null,
    calories: 100,
    eaten: true,
    discarded: false,
  }
}

function candidate(
  overrides: Partial<ComboCandidateSnapshot> = {},
): ComboCandidateSnapshot {
  return {
    id: 'candidate-1',
    comboId: null,
    source: 'draw',
    name: '套餐',
    rarity: 'R',
    components: [component('custom_dish:a')],
    ...overrides,
  }
}

function withMeal(data: AppData, meal: Partial<MealRecord>): AppData {
  return {
    ...data,
    days: {
      ...data.days,
      [DAY]: {
        ...data.days[DAY]!,
        meals: {
          ...data.days[DAY]!.meals,
          lunch: { ...data.days[DAY]!.meals.lunch, ...meal },
        },
      },
    },
  }
}

function officialDish(): Dish {
  return {
    id: 'white_rice',
    name: '白米饭',
    rarity: 'R',
    category: 'staple',
    meals: ['breakfast', 'lunch', 'dinner'],
    ingredients: [{ ingredientId: 'cooked_rice', grams: 200 }],
    image: '🍚',
    cooking: { method: '煮', timeMinutes: 30, steps: ['淘米', '加水', '煮熟'] },
  }
}

function officialCombo(): Combo {
  return {
    id: 'combo_white_rice',
    name: '白米饭套餐',
    rarity: 'R',
    meals: ['breakfast', 'lunch', 'dinner'],
    components: ['white_rice'],
  }
}

describe('calcCustomDishCalories', () => {
  it('sums ingredient rows and rounds', () => {
    const dish = customDish({
      ingredientRows: [
        { name: '米饭', kcalPer100g: 116, grams: 150 },
        { name: '鸡胸', kcalPer100g: 133, grams: 75.5 },
      ],
    })

    expect(calcCustomDishCalories(dish)).toBe(Math.round(174 + 100.415))
  })

  it('returns null when an ingredient-mode dish has no rows', () => {
    expect(
      calcCustomDishCalories(customDish({ ingredientRows: [] })),
    ).toBeNull()
  })

  it('uses the entered total in total mode', () => {
    const dish = customDish({
      calorieMode: 'total',
      calories: 480.4,
      ingredientRows: [],
    })

    expect(calcCustomDishCalories(dish)).toBe(480)
  })

  it('returns null in total mode without a total', () => {
    expect(
      calcCustomDishCalories(customDish({ calorieMode: 'total', calories: null })),
    ).toBeNull()
  })
})

describe('buildLibraryDish', () => {
  it('carries rows, image id, emoji and calories into the runtime dish', () => {
    const dish = buildLibraryDish(
      customDish({ imageId: 'img:1', emoji: null, cooking: null }),
    )

    expect(dish.id).toBe('custom_dish:a')
    expect(dish.isCustom).toBe(true)
    expect(dish.imageId).toBe('img:1')
    expect(dish.image).toBe('')
    expect(dish.emoji).toBe('🍽️')
    expect(dish.cooking).toBeNull()
    expect(dish.calories).toBe(Math.round(40 + 72))
    expect(dish.ingredientDetails).toEqual([
      { ingredientId: 'tomato', name: '番茄', kcalPer100g: 20, grams: 200 },
      { name: '鸡蛋', kcalPer100g: 144, grams: 50 },
    ])
    expect(dish.ingredients).toEqual([
      { ingredientId: 'tomato', grams: 200 },
      { ingredientId: 'custom_dish:a:ingredient:2', grams: 50 },
    ])
  })

  it('keeps the chosen emoji when no image is uploaded', () => {
    const dish = buildLibraryDish(customDish({ emoji: '🍅' }))

    expect(dish.image).toBe('')
    expect(dish.emoji).toBe('🍅')
  })

  it('keeps the total-calorie mode on the runtime dish', () => {
    const dish = buildLibraryDish(
      customDish({ calorieMode: 'total', calories: 520, ingredientRows: [] }),
    )

    expect(dish.calories).toBe(520)
    expect(dish.ingredientDetails).toEqual([])
  })
})

describe('buildHiddenCombo', () => {
  it('wraps the dish in a single-component combo', () => {
    const combo = buildHiddenCombo(customDish({ rarity: 'SR' }))

    expect(combo).toEqual({
      id: `${CUSTOM_COMBO_ID_PREFIX}custom_dish:a`,
      name: '番茄炒蛋',
      rarity: 'SR',
      meals: ['lunch', 'dinner'],
      components: ['custom_dish:a'],
    })
  })
})

describe('buildDishLibrary', () => {
  const official = [officialDish()]
  const combos = [officialCombo()]

  it('adds active pool dishes to dishes and combos', () => {
    const library = buildDishLibrary(
      { customDishes: [customDish()] },
      official,
      combos,
    )

    expect(library.dishes.map((dish) => dish.id)).toEqual([
      'white_rice',
      'custom_dish:a',
    ])
    expect(library.combos.map((combo) => combo.id)).toEqual([
      'combo_white_rice',
      `${CUSTOM_COMBO_ID_PREFIX}custom_dish:a`,
    ])
    expect(library.dishById.get('custom_dish:a')?.name).toBe('番茄炒蛋')
  })

  it('keeps dishes out of the pool when the switch is off', () => {
    const library = buildDishLibrary(
      { customDishes: [customDish({ includeInPool: false })] },
      official,
      combos,
    )

    expect(library.dishes.map((dish) => dish.id)).toContain('custom_dish:a')
    expect(library.combos.map((combo) => combo.id)).toEqual([
      'combo_white_rice',
    ])
  })

  it('drops archived dishes from the pool but keeps them findable', () => {
    const library = buildDishLibrary(
      { customDishes: [customDish({ archived: true, includeInPool: false })] },
      official,
      combos,
    )

    expect(library.dishes.map((dish) => dish.id)).not.toContain('custom_dish:a')
    expect(library.combos.map((combo) => combo.id)).toEqual([
      'combo_white_rice',
    ])
    expect(library.dishById.get('custom_dish:a')?.archived).toBe(true)
  })
})

describe('hasCheckInRecords', () => {
  it('is true when a stamp exists', () => {
    const data = createEmptyAppData(DAY)
    const withStamp: AppData = {
      ...data,
      stamps: {
        'custom_dish:a': {
          checkInCount: 1,
          firstCheckInDate: DAY,
          checkInDates: [DAY],
        },
      },
    }

    expect(hasCheckInRecords(withStamp, 'custom_dish:a')).toBe(true)
  })

  it('is true when the dish appears in a checked-in selected combo', () => {
    const data = withMeal(createEmptyAppData(DAY), {
      candidateCombos: [candidate()],
      selectedCandidateId: 'candidate-1',
      budget: { baseUsed: 1, adUsed: 0, checkedIn: true },
    })

    expect(hasCheckInRecords(data, 'custom_dish:a')).toBe(true)
  })

  it('is false for unchecked drafts', () => {
    const data = withMeal(createEmptyAppData(DAY), {
      candidateCombos: [candidate()],
      selectedCandidateId: 'candidate-1',
    })

    expect(hasCheckInRecords(data, 'custom_dish:a')).toBe(false)
    expect(hasCheckInRecords(data, 'custom_dish:other')).toBe(false)
  })
})

describe('hasAnySnapshotReference', () => {
  it('finds components in unselected drafts', () => {
    const data = withMeal(createEmptyAppData(DAY), {
      candidateCombos: [candidate({ id: 'draft-1' })],
      selectedCandidateId: null,
    })

    expect(
      hasAnySnapshotReference(data, { dishId: 'custom_dish:a' }),
    ).toBe(true)
  })

  it('finds image ids on components and other custom dishes', () => {
    const data = withMeal(createEmptyAppData(DAY), {
      candidateCombos: [
        candidate({
          components: [component('custom_dish:a', 'img:old')],
        }),
      ],
    })

    expect(
      hasAnySnapshotReference(data, {
        imageId: 'img:old',
        ignoreDishId: 'custom_dish:a',
      }),
    ).toBe(true)
  })

  it('ignores the dish being edited when checking its own image', () => {
    const data: AppData = {
      ...createEmptyAppData(DAY),
      customDishes: [customDish({ imageId: 'img:mine' })],
    }

    expect(
      hasAnySnapshotReference(data, {
        imageId: 'img:mine',
        ignoreDishId: 'custom_dish:a',
      }),
    ).toBe(false)
  })

  it('returns false when nothing references the target', () => {
    const data = createEmptyAppData(DAY)

    expect(
      hasAnySnapshotReference(data, {
        dishId: 'custom_dish:missing',
        imageId: 'img:missing',
      }),
    ).toBe(false)
  })
})

describe('custom dishes in gameplay', () => {
  const activeDish = customDish({ imageId: 'img:a', meals: ['lunch'] })

  it('draws a hidden combo from the library pool', () => {
    const library = buildDishLibrary({ customDishes: [activeDish] }, [], [])

    const result = drawForMeal(
      {
        meal: 'lunch',
        budget: createMealDrawBudget(),
        tokenCount: 0,
        pityCount: 0,
        drawnComboIds: [],
      },
      { catalog: library.combos, rng: () => 0 },
    )

    expect(result.status).toBe('drawn')
    if (result.status === 'drawn') {
      expect(result.combo.id).toBe(`${CUSTOM_COMBO_ID_PREFIX}custom_dish:a`)
    }
  })

  it('redraws a component into a custom dish with its image', () => {
    const library = buildDishLibrary({ customDishes: [activeDish] }, [], [])
    const candidate = candidateFor('main')

    const result = redrawComponent(
      {
        meal: 'lunch',
        candidate,
        componentId: 'comp:old',
        budget: createMealDrawBudget(),
        tokenCount: 0,
        pityCount: 0,
      },
      { dishCatalog: library.dishes, rng: () => 0 },
    )

    expect(result.status).toBe('redrawn')
    if (result.status === 'redrawn') {
      expect(result.component.dishId).toBe('custom_dish:a')
      expect(result.component.imageId).toBe('img:a')
      expect(result.component.calories).toBe(Math.round(40 + 72))
    }
  })

  it('grants a stamp for a checked-in custom dish', () => {
    const library = buildDishLibrary({ customDishes: [activeDish] }, [], [])
    const combo = library.combos[0]!
    const candidate = createComboCandidate(combo, 'draw', combo.id, {
      dishById: library.dishById,
    })

    const checked = checkInMeal({
      candidate,
      budget: createMealDrawBudget(),
      wallet: createTokenWallet(DAY),
      dateKey: DAY,
      dishCatalog: library.dishById,
    })

    expect(checked.status).toBe('checked-in')
    if (checked.status === 'checked-in') {
      expect(checked.stampDishIds).toEqual(['custom_dish:a'])
      expect(checked.components[0]).toMatchObject({
        dishId: 'custom_dish:a',
        imageId: 'img:a',
      })
    }
  })

  it('keeps the entered total for total-mode dishes at check-in', () => {
    const totalDish = customDish({
      calorieMode: 'total',
      calories: 300,
      ingredientRows: [],
      meals: ['lunch'],
    })
    const library = buildDishLibrary({ customDishes: [totalDish] }, [], [])
    const combo = library.combos[0]!
    const candidate = createComboCandidate(combo, 'draw', combo.id, {
      dishById: library.dishById,
    })

    const checked = checkInMeal({
      candidate,
      budget: createMealDrawBudget(),
      wallet: createTokenWallet(DAY),
      dateKey: DAY,
      dishCatalog: library.dishById,
    })

    expect(checked.status).toBe('checked-in')
    if (checked.status === 'checked-in') {
      expect(checked.components[0]?.calories).toBe(300)
      expect(checked.calories).toBe(300)
    }
  })
})

function candidateFor(category: ComboCandidateSnapshot['components'][number]['category']) {
  return candidate({
    components: [
      {
        ...component('white_rice'),
        id: 'comp:old',
        category,
        ingredients: [],
      },
    ],
  })
}
