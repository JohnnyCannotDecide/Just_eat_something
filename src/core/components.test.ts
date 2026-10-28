import { describe, expect, it } from 'vitest'

import type {
  Combo,
  ComponentIngredientSnapshot,
  Dish,
  Ingredient,
  MealComponentSnapshot,
} from './types'
import {
  addCustomComponent,
  addDishComponent,
  calcComponentCalories,
  calcMealCalories,
  createComboCandidate,
  createComponentId,
  createCustomComponent,
  createCustomOnlyCandidate,
  createDishComponent,
  createLegacyCandidate,
  createLegacyCustomCandidate,
  discardComponent,
  getActiveComponents,
  getComponentTotalGrams,
  getEatenStampDishIds,
  hasEatenLibraryComponent,
  replaceComponent,
  restoreComponent,
  scaleComponentToTotal,
  withComponentEaten,
  withComponentIngredientGrams,
  withCustomComponentCalories,
} from './components'

const ingredientById = new Map<string, Ingredient>([
  ['rice', { id: 'rice', name: '米饭', kcalPer100g: 116 }],
  ['egg', { id: 'egg', name: '鸡蛋', kcalPer100g: 144 }],
  ['oil', { id: 'oil', name: '油', kcalPer100g: 900 }],
])

function makeDish(overrides: Partial<Dish> & { id: string }): Dish {
  return {
    name: overrides.id,
    rarity: 'R',
    category: 'staple',
    meals: ['breakfast', 'lunch', 'dinner'],
    ingredients: [],
    image: `/images/dishes/${overrides.id}.png`,
    cooking: { method: '煮', timeMinutes: 5, steps: ['煮一煮'] },
    ...overrides,
  }
}

const riceEggDish = makeDish({
  id: 'rice_egg',
  name: '米饭加蛋',
  category: 'staple',
  ingredients: [
    { ingredientId: 'rice', grams: 200 },
    { ingredientId: 'egg', grams: 100 },
  ],
})

const eggDish = makeDish({
  id: 'egg_only',
  name: '鸡蛋',
  category: 'main',
  ingredients: [{ ingredientId: 'egg', grams: 100 }],
})

const dishById = new Map<string, Dish>(
  [riceEggDish, eggDish].map((dish) => [dish.id, dish]),
)

function makeCombo(overrides: Partial<Combo> & { id: string }): Combo {
  return {
    name: overrides.id,
    rarity: 'R',
    meals: ['breakfast', 'lunch', 'dinner'],
    components: [],
    ...overrides,
  }
}

function snapshot(
  overrides: Partial<MealComponentSnapshot> = {},
): MealComponentSnapshot {
  return {
    id: 'c1',
    kind: 'dish',
    origin: 'combo',
    dishId: 'rice_egg',
    name: '米饭加蛋',
    category: 'staple',
    rarity: 'R',
    image: null,
    cooking: null,
    ingredients: [
      {
        ingredientId: 'rice',
        name: '米饭',
        kcalPer100g: 116,
        grams: 200,
      },
      {
        ingredientId: 'egg',
        name: '鸡蛋',
        kcalPer100g: 144,
        grams: 100,
      },
    ],
    grams: 300,
    calories: 376,
    eaten: true,
    discarded: false,
    ...overrides,
  }
}

function candidate(
  components: MealComponentSnapshot[],
): ReturnType<typeof createComboCandidate> {
  return {
    id: 'candidate',
    comboId: 'combo',
    source: 'draw',
    name: '测试套餐',
    rarity: 'R',
    components,
  }
}

describe('createComponentId', () => {
  it('slugs the seed and bumps the suffix until the id is free', () => {
    const used = new Set(['comp:redraw:rice-egg:1'])

    expect(createComponentId('redraw', 'Rice Egg', used)).toBe(
      'comp:redraw:rice-egg:2',
    )
  })

  it('falls back to "item" when the seed has no ASCII characters', () => {
    expect(createComponentId('manual', '白米饭', new Set())).toBe(
      'comp:manual:item:1',
    )
  })
})

describe('createDishComponent', () => {
  it('materializes ingredients, total grams, and calories from the catalog', () => {
    const component = createDishComponent(riceEggDish, 'combo', 'c1', {
      ingredientById,
    })

    expect(component.kind).toBe('dish')
    expect(component.dishId).toBe('rice_egg')
    expect(component.ingredients).toEqual([
      {
        ingredientId: 'rice',
        name: '米饭',
        kcalPer100g: 116,
        grams: 200,
      },
      {
        ingredientId: 'egg',
        name: '鸡蛋',
        kcalPer100g: 144,
        grams: 100,
      },
    ])
    expect(component.grams).toBe(300)
    expect(component.calories).toBe(376)
    expect(component.eaten).toBe(true)
    expect(component.discarded).toBe(false)
  })

  it('rounds calories once after summing, not per ingredient', () => {
    const dish = makeDish({
      id: 'rounding',
      ingredients: [
        { ingredientId: 'a', grams: 33 },
        { ingredientId: 'b', grams: 33 },
      ],
    })
    const catalog = new Map<string, Ingredient>([
      ['a', { id: 'a', name: 'A', kcalPer100g: 13.35 }],
      ['b', { id: 'b', name: 'B', kcalPer100g: 13.35 }],
    ])

    const component = createDishComponent(dish, 'combo', 'c1', {
      ingredientById: catalog,
    })

    expect(component.calories).toBe(9)
    expect(component.grams).toBe(66)
  })

  it('applies ingredient gram overrides and ignores unknown keys', () => {
    const component = createDishComponent(riceEggDish, 'combo', 'c1', {
      ingredientById,
      ingredientGrams: { rice: 100, unknown: 50 },
    })

    expect(component.ingredients[0]?.grams).toBe(100)
    expect(component.grams).toBe(200)
    expect(component.calories).toBe(260)
  })

  it('keeps a null total for dishes without ingredients', () => {
    const component = createDishComponent(makeDish({ id: 'empty' }), 'combo', 'c1')

    expect(component.ingredients).toEqual([])
    expect(component.grams).toBeNull()
    expect(component.calories).toBeNull()
  })

  it('deep copies cooking steps so later dish edits do not leak into snapshots', () => {
    const dish = makeDish({ id: 'cook', category: 'main' })
    const component = createDishComponent(dish, 'combo', 'c1')

    dish.cooking?.steps.push('后来加的步骤')

    expect(component.cooking?.steps).toEqual(['煮一煮'])
  })
})

describe('createCustomComponent', () => {
  it('trims the name and rounds calories, allowing null', () => {
    const component = createCustomComponent(
      { name: '  朋友聚餐  ', calories: 800.4 },
      'c1',
    )

    expect(component).toMatchObject({
      id: 'c1',
      kind: 'custom',
      origin: 'custom',
      dishId: null,
      name: '朋友聚餐',
      category: null,
      grams: null,
      calories: 800,
      eaten: true,
      discarded: false,
    })

    expect(
      createCustomComponent({ name: '奶茶', calories: null }, 'c2').calories,
    ).toBeNull()
  })

  it('rejects blank names and invalid calories', () => {
    expect(() => createCustomComponent({ name: '   ', calories: 10 }, 'c')).toThrow(
      '请填写自定义记录的名称',
    )
    expect(() =>
      createCustomComponent({ name: '奶茶', calories: -1 }, 'c'),
    ).toThrow(RangeError)
    expect(() =>
      createCustomComponent({ name: '奶茶', calories: Number.NaN }, 'c'),
    ).toThrow(RangeError)
  })
})

describe('createComboCandidate', () => {
  it('builds one unique component per dish and keeps combo metadata', () => {
    const combo = makeCombo({
      id: 'combo_a',
      name: '双蛋套餐',
      rarity: 'SR',
      tip: '吃饱一点',
      components: ['rice_egg', 'egg_only', 'rice_egg'],
    })

    const result = createComboCandidate(combo, 'draw', undefined, {
      dishById,
      ingredientById,
    })

    expect(result.id).toBe('combo_a')
    expect(result.comboId).toBe('combo_a')
    expect(result.name).toBe('双蛋套餐')
    expect(result.rarity).toBe('SR')
    expect(result.tip).toBe('吃饱一点')
    expect(result.components.map((component) => component.dishId)).toEqual([
      'rice_egg',
      'egg_only',
      'rice_egg',
    ])
    const ids = new Set(result.components.map((component) => component.id))
    expect(ids.size).toBe(3)
  })

  it('keeps a placeholder component for a missing dish', () => {
    const combo = makeCombo({ id: 'broken', components: ['missing_dish'] })

    const result = createComboCandidate(combo, 'draw')

    expect(result.components).toHaveLength(1)
    expect(result.components[0]).toMatchObject({
      kind: 'dish',
      dishId: 'missing_dish',
      name: 'missing_dish',
      category: 'snack',
      rarity: 'R',
      ingredients: [],
      grams: null,
      calories: null,
    })
  })
})

describe('legacy candidates', () => {
  it('creates a deterministic single-dish candidate and applies actual grams', () => {
    const result = createLegacyCandidate({
      dateKey: '2026-10-01',
      meal: 'lunch',
      dishId: 'rice_egg',
      actualGrams: { rice: 150, unknown: 10 },
      eaten: true,
      dishById,
      ingredientById,
    })

    expect(result.id).toBe('legacy:2026-10-01:lunch:rice_egg')
    expect(result.comboId).toBeNull()
    expect(result.source).toBe('legacy')
    expect(result.components).toHaveLength(1)
    expect(result.components[0]).toMatchObject({
      id: 'legacy:2026-10-01:lunch:rice_egg:component',
      dishId: 'rice_egg',
      grams: 250,
      eaten: true,
    })
    expect(result.components[0]?.ingredients[1]?.grams).toBe(100)
  })

  it('keeps a placeholder when the legacy dish is missing from the catalog', () => {
    const result = createLegacyCandidate({
      dateKey: '2026-10-01',
      meal: 'lunch',
      dishId: 'gone',
      eaten: false,
    })

    expect(result.name).toBe('gone')
    expect(result.components[0]).toMatchObject({
      dishId: 'gone',
      category: 'snack',
      calories: null,
      eaten: false,
    })
  })

  it('creates a deterministic custom-only candidate', () => {
    const result = createLegacyCustomCandidate({
      dateKey: '2026-10-01',
      meal: 'lunch',
      name: '聚餐',
      calories: null,
    })

    expect(result.id).toBe('legacy:2026-10-01:lunch:custom')
    expect(result.components).toHaveLength(1)
    expect(result.components[0]).toMatchObject({
      kind: 'custom',
      name: '聚餐',
      calories: null,
    })
  })

  it('creates a runtime custom-only candidate', () => {
    const result = createCustomOnlyCandidate({
      id: 'custom:2026-10-01:lunch:1',
      name: '夜宵',
      calories: 300,
    })

    expect(result.source).toBe('customRecord')
    expect(result.components[0]?.kind).toBe('custom')
    expect(result.components[0]?.id).toBe('custom:2026-10-01:lunch:1:component')
  })
})

describe('component edits', () => {
  it('lists only active components', () => {
    const result = getActiveComponents(
      candidate([
        snapshot({ id: 'a' }),
        snapshot({ id: 'b', discarded: true }),
      ]),
    )

    expect(result.map((component) => component.id)).toEqual(['a'])
  })

  it('toggles eaten on active components but rejects discarded ones', () => {
    const next = withComponentEaten(candidate([snapshot()]), 'c1', false)
    expect(next.components[0]?.eaten).toBe(false)

    expect(() =>
      withComponentEaten(
        candidate([snapshot({ discarded: true })]),
        'c1',
        true,
      ),
    ).toThrow('已舍弃的部件不能勾选')
  })

  it('scales all ingredients proportionally to a new total', () => {
    const next = scaleComponentToTotal(snapshot(), 600)

    expect(next.ingredients.map((item) => item.grams)).toEqual([400, 200])
    expect(next.grams).toBe(600)
    expect(next.calories).toBe(752)
  })

  it('keeps zero-ingredient-weight components at zero instead of NaN', () => {
    const zero = snapshot({
      ingredients: snapshot().ingredients.map((item) => ({
        ...item,
        grams: 0,
      })),
      grams: 0,
      calories: 0,
    })

    const next = scaleComponentToTotal(zero, 100)

    expect(next.ingredients.map((item) => item.grams)).toEqual([0, 0])
    expect(next.grams).toBe(0)
    expect(next.calories).toBe(0)
  })

  it('rejects scaling custom components and negative totals', () => {
    const custom = createCustomComponent({ name: '奶茶', calories: 300 }, 'x')

    expect(() => scaleComponentToTotal(custom, 100)).toThrow(
      '这个部件没有可调整的食材',
    )
    expect(() => scaleComponentToTotal(snapshot(), -1)).toThrow(RangeError)
  })

  it('edits a single ingredient and recomputes totals', () => {
    const next = withComponentIngredientGrams(snapshot(), { egg: 50 })

    expect(next.ingredients.map((item) => item.grams)).toEqual([200, 50])
    expect(next.grams).toBe(250)
    expect(next.calories).toBe(304)
  })

  it('rejects unknown ingredients and invalid grams', () => {
    expect(() =>
      withComponentIngredientGrams(snapshot(), { not_here: 10 }),
    ).toThrow('食材不在部件中')
    expect(() =>
      withComponentIngredientGrams(snapshot(), { rice: Number.NaN }),
    ).toThrow(RangeError)
    expect(() =>
      withComponentIngredientGrams(snapshot(), { rice: -1 }),
    ).toThrow(RangeError)
  })

  it('updates custom calories but not library component calories', () => {
    const custom = createCustomComponent({ name: '奶茶', calories: 300 }, 'x')
    expect(withCustomComponentCalories(custom, 350.6).calories).toBe(351)
    expect(withCustomComponentCalories(custom, null).calories).toBeNull()
    expect(() => withCustomComponentCalories(snapshot(), 100)).toThrow(
      '只有自定义记录可以直接修改热量',
    )
  })
})

describe('adding components', () => {
  it('adds a library dish with a manual origin and a free id', () => {
    const base = candidate([snapshot()])
    const next = addDishComponent(
      base,
      dishById.get('egg_only')!,
      'lunch',
      { ingredientById },
    )

    expect(next.components).toHaveLength(2)
    expect(next.components[1]).toMatchObject({
      kind: 'dish',
      origin: 'manual',
      dishId: 'egg_only',
    })
    expect(next.components[1]?.id).not.toBe(next.components[0]?.id)
  })

  it('rejects wrong meals, duplicate active dishes, and UR into non-UR', () => {
    const base = candidate([snapshot()])

    expect(() =>
      addDishComponent(
        base,
        makeDish({ id: 'dinner_only', meals: ['dinner'] }),
        'lunch',
      ),
    ).toThrow('这道菜不支持当前餐次')

    expect(() =>
      addDishComponent(base, riceEggDish, 'lunch', { ingredientById }),
    ).toThrow('这个套餐里已经有这道菜了')

    expect(() =>
      addDishComponent(
        base,
        makeDish({ id: 'ur_dish', rarity: 'UR', category: 'main' }),
        'lunch',
      ),
    ).toThrow('非 UR 套餐不能手动添加 UR 菜品')
  })

  it('allows adding a dish again after its only copy was discarded', () => {
    const base = candidate([snapshot({ discarded: true })])
    const next = addDishComponent(base, riceEggDish, 'lunch', {
      ingredientById,
    })

    expect(next.components).toHaveLength(2)
  })

  it('allows UR dishes into UR combos', () => {
    const base = { ...candidate([snapshot()]), rarity: 'UR' as const }
    const next = addDishComponent(
      base,
      makeDish({ id: 'ur_dish', rarity: 'UR', category: 'main' }),
      'lunch',
    )

    expect(next.components).toHaveLength(2)
  })

  it('allows multiple custom components with unique ids', () => {
    const first = addCustomComponent(candidate([snapshot()]), {
      name: '奶茶',
      calories: 300,
    })
    const second = addCustomComponent(first, { name: '奶茶', calories: null })

    expect(second.components).toHaveLength(3)
    expect(
      new Set(second.components.map((component) => component.id)).size,
    ).toBe(3)
  })
})

describe('discard and restore', () => {
  it('discards a component while another stays active', () => {
    const next = discardComponent(
      candidate([snapshot({ id: 'a' }), snapshot({ id: 'b' })]),
      'a',
    )

    expect(next.components[0]?.discarded).toBe(true)
    expect(getActiveComponents(next)).toHaveLength(1)
  })

  it('refuses to discard the last active component or discard twice', () => {
    expect(() => discardComponent(candidate([snapshot()]), 'c1')).toThrow(
      '至少要保留一个部件',
    )

    const already = candidate([
      snapshot({ id: 'a', discarded: true }),
      snapshot({ id: 'b' }),
    ])
    expect(() => discardComponent(already, 'a')).toThrow('这个部件已经舍弃了')
  })

  it('restores a discarded component', () => {
    const discarded = candidate([
      snapshot({ id: 'a', discarded: true }),
      snapshot({ id: 'b', dishId: 'egg_only', name: '鸡蛋' }),
    ])
    const next = restoreComponent(discarded, 'a')

    expect(next.components[0]?.discarded).toBe(false)
  })

  it('rejects restoring a component that would duplicate an active dish', () => {
    const duplicated = candidate([
      snapshot({ id: 'a', discarded: true }),
      snapshot({ id: 'b' }),
    ])

    expect(() => restoreComponent(duplicated, 'a')).toThrow(
      '这个套餐里已经有这道菜了',
    )
    expect(() => restoreComponent(candidate([snapshot()]), 'c1')).toThrow(
      '这个部件没有被舍弃',
    )
  })

  it('replaces a component and rejects id collisions', () => {
    const base = candidate([snapshot({ id: 'a' }), snapshot({ id: 'b' })])
    const next = replaceComponent(base, 'a', snapshot({ id: 'c' }))

    expect(next.components.map((component) => component.id)).toEqual(['c', 'b'])
    expect(() => replaceComponent(base, 'a', snapshot({ id: 'b' }))).toThrow(
      '部件 id 冲突',
    )
    expect(() => replaceComponent(base, 'missing', snapshot({ id: 'z' }))).toThrow(
      '部件不存在',
    )
  })
})

describe('calorie and stamp derivation', () => {
  it('sums ingredient calories and rounds once', () => {
    const ingredients: ComponentIngredientSnapshot[] = [
      { name: 'A', kcalPer100g: 10.5, grams: 33 },
      { name: 'B', kcalPer100g: 10.5, grams: 33 },
    ]

    expect(calcComponentCalories({ ingredients, grams: 66, calories: null })).toBe(
      7,
    )
    expect(
      calcComponentCalories({ ingredients: [], grams: null, calories: null }),
    ).toBeNull()
  })

  it('only counts eaten, non-discarded components with numeric calories', () => {
    const components = [
      snapshot({ id: 'a', calories: 100 }),
      snapshot({ id: 'b', calories: 200, eaten: false }),
      snapshot({ id: 'c', calories: 300, discarded: true }),
      snapshot({ id: 'd', calories: null }),
      snapshot({ id: 'e', calories: 50 }),
    ]

    expect(calcMealCalories(components)).toBe(150)
    expect(calcMealCalories([snapshot({ calories: null })])).toBeNull()
  })

  it('dedupes stamps by dish and ignores custom, discarded, uneaten, and missing dishes', () => {
    const catalog = new Map([['rice_egg', riceEggDish], ['egg_only', eggDish]])
    const components = [
      snapshot({ id: 'a', dishId: 'rice_egg' }),
      snapshot({ id: 'b', dishId: 'rice_egg' }),
      snapshot({ id: 'c', dishId: 'egg_only', eaten: false }),
      snapshot({ id: 'd', dishId: 'egg_only', discarded: true }),
      createCustomComponent({ name: '奶茶', calories: 300 }, 'e'),
      snapshot({ id: 'f', dishId: 'missing_for_stamp', name: 'gone' }),
      snapshot({ id: 'g', dishId: 'egg_only', name: '鸡蛋' }),
    ]

    expect(getEatenStampDishIds(components, catalog)).toEqual([
      'rice_egg',
      'egg_only',
    ])
    expect(hasEatenLibraryComponent(components)).toBe(true)
    expect(
      hasEatenLibraryComponent([
        createCustomComponent({ name: '奶茶', calories: 300 }, 'x'),
      ]),
    ).toBe(false)
  })
})

describe('getComponentTotalGrams', () => {
  it('sums and rounds one decimal place', () => {
    expect(
      getComponentTotalGrams({
        ingredients: [
          { name: 'A', kcalPer100g: 0, grams: 33.33 },
          { name: 'B', kcalPer100g: 0, grams: 33.33 },
        ],
        grams: null,
      }),
    ).toBe(66.7)
  })
})
