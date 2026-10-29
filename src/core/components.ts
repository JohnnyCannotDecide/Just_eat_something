import {
  dishById as defaultDishById,
  ingredientById as defaultIngredientById,
} from '@/data'

import type {
  Combo,
  ComboCandidateSnapshot,
  ComboSource,
  ComponentIngredientSnapshot,
  ComponentOrigin,
  Dish,
  Ingredient,
  MealComponentSnapshot,
  MealType,
} from './types'

export interface SnapshotCatalogOptions {
  dishById?: ReadonlyMap<string, Dish>
  ingredientById?: ReadonlyMap<string, Ingredient>
}

export interface DishComponentOptions extends SnapshotCatalogOptions {
  eaten?: boolean
  discarded?: boolean
  /** ingredientId → 实际克数；不存在的 key 会被忽略。 */
  ingredientGrams?: Readonly<Record<string, number>>
  /** 该槽位本轮出现过的菜；缺省为 [dish.id]。 */
  seenDishIds?: readonly string[]
}

export interface CustomComponentInput {
  name: string
  calories: number | null
}

export interface LegacyCandidateInput extends SnapshotCatalogOptions {
  dateKey: string
  meal: MealType
  dishId: string
  actualGrams?: Readonly<Record<string, number>>
  eaten?: boolean
}

export interface LegacyCustomCandidateInput {
  dateKey: string
  meal: MealType
  name: string
  calories: number | null
}

export interface CustomOnlyCandidateInput {
  id: string
  name: string
  calories: number | null
}

type ComponentFields = Pick<
  MealComponentSnapshot,
  'ingredients' | 'grams' | 'calories'
>

function assertNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`克数必须是非负有限数: ${label}`)
  }
}

function roundGrams(value: number): number {
  return Math.round(value * 10) / 10
}

function normalizeCalories(value: number | null): number | null {
  if (value === null) {
    return null
  }
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError('热量必须是非负有限数')
  }
  return Math.round(value)
}

function sumIngredientKcal(
  ingredients: readonly ComponentIngredientSnapshot[],
): number | null {
  if (ingredients.length === 0) {
    return null
  }

  let total = 0
  for (const item of ingredients) {
    assertNonNegative(item.grams, item.name)
    if (!Number.isFinite(item.kcalPer100g) || item.kcalPer100g < 0) {
      throw new RangeError(`食材热量必须是非负有限数: ${item.name}`)
    }
    total += (item.kcalPer100g * item.grams) / 100
  }
  return Math.round(total)
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * 生成同一个套餐内唯一的部件 id。
 * 以现有全部部件（含已舍弃）为基准递增，避免“舍弃后重抽到同一道菜”撞 id。
 */
export function createComponentId(
  origin: ComponentOrigin,
  seed: string,
  usedIds: ReadonlySet<string>,
): string {
  const slug = slugify(seed) || 'item'
  let index = 1
  let id = `comp:${origin}:${slug}:${index}`
  while (usedIds.has(id)) {
    index += 1
    id = `comp:${origin}:${slug}:${index}`
  }
  return id
}

/** 洗牌后可能再次抽到同一套餐；给它一个唯一实例 id，避免覆盖旧候选。 */
export function createCandidateInstanceId(
  comboId: string,
  usedIds: ReadonlySet<string>,
): string {
  let id = comboId
  let index = 2
  while (usedIds.has(id)) {
    id = `${comboId}#${index}`
    index += 1
  }
  return id
}

export function getComponentTotalGrams(
  component: Pick<MealComponentSnapshot, 'ingredients' | 'grams'>,
): number | null {
  if (component.ingredients.length === 0) {
    return component.grams
  }

  let total = 0
  for (const item of component.ingredients) {
    assertNonNegative(item.grams, item.name)
    total += item.grams
  }
  return roundGrams(total)
}

export function calcComponentCalories(component: ComponentFields): number | null {
  return sumIngredientKcal(component.ingredients)
}

function buildIngredients(
  dish: Dish,
  options: DishComponentOptions,
): ComponentIngredientSnapshot[] {
  // 自制菜自带食材详情（名称与热量不一定在官方食材表里）；官方菜查表。
  if (dish.ingredientDetails) {
    return dish.ingredientDetails.map((item) => {
      const override = item.ingredientId
        ? options.ingredientGrams?.[item.ingredientId]
        : undefined
      const grams = override ?? item.grams
      assertNonNegative(grams, `${item.name}（菜品 ${dish.id}）`)
      return { ...item, grams }
    })
  }

  const lookup = options.ingredientById ?? defaultIngredientById

  return dish.ingredients.map((item) => {
    const override = options.ingredientGrams?.[item.ingredientId]
    const grams = override ?? item.grams
    assertNonNegative(grams, `${item.ingredientId}（菜品 ${dish.id}）`)

    const ingredient = lookup.get(item.ingredientId)
    return {
      ingredientId: item.ingredientId,
      name: ingredient?.name ?? item.ingredientId,
      kcalPer100g: ingredient?.kcalPer100g ?? 0,
      grams,
    }
  })
}

function toCooking(dish: Dish): MealComponentSnapshot['cooking'] {
  if (!dish.cooking) {
    return null
  }
  return {
    method: dish.cooking.method,
    timeMinutes: dish.cooking.timeMinutes,
    steps: [...dish.cooking.steps],
    ...(dish.cooking.tips !== undefined ? { tips: dish.cooking.tips } : {}),
  }
}

export function createDishComponent(
  dish: Dish,
  origin: ComponentOrigin,
  id: string,
  options: DishComponentOptions = {},
): MealComponentSnapshot {
  const ingredients = buildIngredients(dish, options)
  // 直接热量模式的自制菜没有可按食材累加的热量，用菜谱上的总热量。
  const calories =
    dish.calories !== undefined && dish.calories !== null
      ? Math.round(dish.calories)
      : sumIngredientKcal(ingredients)

  return {
    id,
    kind: 'dish',
    origin,
    dishId: dish.id,
    name: dish.name,
    category: dish.category,
    rarity: dish.rarity,
    image: dish.image,
    ...(dish.imageId !== undefined ? { imageId: dish.imageId } : {}),
    ...(dish.emoji !== undefined ? { emoji: dish.emoji } : {}),
    ...(dish.stampImage !== undefined ? { stampImage: dish.stampImage } : {}),
    ...(dish.tip !== undefined ? { tip: dish.tip } : {}),
    cooking: toCooking(dish),
    ingredients,
    grams: ingredients.length === 0 ? null : getComponentTotalGrams({ ingredients, grams: null }),
    calories,
    eaten: options.eaten ?? true,
    discarded: options.discarded ?? false,
    seenDishIds: [...new Set([...(options.seenDishIds ?? []), dish.id])],
  }
}

export function createCustomComponent(
  input: CustomComponentInput,
  id: string,
): MealComponentSnapshot {
  const name = input.name.trim()
  if (name.length === 0) {
    throw new Error('请填写自定义记录的名称')
  }

  return {
    id,
    kind: 'custom',
    origin: 'custom',
    dishId: null,
    name,
    category: null,
    rarity: 'R',
    image: null,
    cooking: null,
    ingredients: [],
    grams: null,
    calories: normalizeCalories(input.calories),
    eaten: true,
    discarded: false,
    seenDishIds: [],
  }
}

function createMissingDishComponent(
  dishId: string,
  id: string,
  eaten: boolean,
): MealComponentSnapshot {
  return {
    id,
    kind: 'dish',
    origin: 'combo',
    dishId,
    name: dishId,
    category: 'snack',
    rarity: 'R',
    image: null,
    cooking: null,
    ingredients: [],
    grams: null,
    calories: null,
    eaten,
    discarded: false,
    seenDishIds: [dishId],
  }
}

export function createComboCandidate(
  combo: Combo,
  source: ComboSource,
  id: string = combo.id,
  options: SnapshotCatalogOptions = {},
): ComboCandidateSnapshot {
  const dishLookup = options.dishById ?? defaultDishById
  const usedIds = new Set<string>()

  const components = combo.components.map((dishId) => {
    const dish = dishLookup.get(dishId)
    if (!dish) {
      const componentId = createComponentId('combo', dishId, usedIds)
      usedIds.add(componentId)
      return createMissingDishComponent(dishId, componentId, true)
    }

    const componentId = createComponentId('combo', dish.id, usedIds)
    usedIds.add(componentId)
    return createDishComponent(dish, 'combo', componentId, {
      ingredientById: options.ingredientById,
    })
  })

  return {
    id,
    comboId: combo.id,
    source,
    name: combo.name,
    nameSource: 'auto',
    baseName: combo.name,
    baseDishIds: [...combo.components],
    rarity: combo.rarity,
    ...(combo.tip !== undefined ? { tip: combo.tip } : {}),
    components,
  }
}

export function createLegacyCandidate(
  input: LegacyCandidateInput,
): ComboCandidateSnapshot {
  const dishLookup = input.dishById ?? defaultDishById
  const dish = dishLookup.get(input.dishId)
  const candidateId = `legacy:${input.dateKey}:${input.meal}:${input.dishId}`
  const componentId = `${candidateId}:component`
  const eaten = input.eaten ?? false

  if (!dish) {
    return {
      id: candidateId,
      comboId: null,
      source: 'legacy',
      name: input.dishId,
      nameSource: 'legacy',
      baseName: input.dishId,
      baseDishIds: [input.dishId],
      rarity: 'R',
      components: [createMissingDishComponent(input.dishId, componentId, eaten)],
    }
  }

  const sanitizedGrams: Record<string, number> = {}
  for (const [ingredientId, grams] of Object.entries(input.actualGrams ?? {})) {
    if (Number.isFinite(grams) && grams >= 0) {
      sanitizedGrams[ingredientId] = grams
    }
  }

  return {
    id: candidateId,
    comboId: null,
    source: 'legacy',
    name: dish.name,
    nameSource: 'legacy',
    baseName: dish.name,
    baseDishIds: [dish.id],
    rarity: dish.rarity,
    ...(dish.tip !== undefined ? { tip: dish.tip } : {}),
    components: [
      createDishComponent(dish, 'combo', componentId, {
        eaten,
        ingredientGrams: sanitizedGrams,
        ingredientById: input.ingredientById,
      }),
    ],
  }
}

export function createLegacyCustomCandidate(
  input: LegacyCustomCandidateInput,
): ComboCandidateSnapshot {
  const candidateId = `legacy:${input.dateKey}:${input.meal}:custom`
  const component = createCustomComponent(
    { name: input.name, calories: input.calories },
    `${candidateId}:component`,
  )

  return {
    id: candidateId,
    comboId: null,
    source: 'legacy',
    name: component.name,
    nameSource: 'manual',
    manualName: component.name,
    baseName: component.name,
    baseDishIds: [],
    rarity: 'R',
    components: [component],
  }
}

export function createCustomOnlyCandidate(
  input: CustomOnlyCandidateInput,
): ComboCandidateSnapshot {
  const component = createCustomComponent(
    { name: input.name, calories: input.calories },
    `${input.id}:component`,
  )

  return {
    id: input.id,
    comboId: null,
    source: 'customRecord',
    name: component.name,
    nameSource: 'manual',
    manualName: component.name,
    baseName: component.name,
    baseDishIds: [],
    rarity: 'R',
    components: [component],
  }
}

export function getActiveComponents(
  candidate: ComboCandidateSnapshot,
): MealComponentSnapshot[] {
  return candidate.components.filter((component) => !component.discarded)
}

function findComponent(
  candidate: ComboCandidateSnapshot,
  componentId: string,
): MealComponentSnapshot {
  const component = candidate.components.find((item) => item.id === componentId)
  if (!component) {
    throw new Error(`部件不存在: ${componentId}`)
  }
  return component
}

function updateComponent(
  candidate: ComboCandidateSnapshot,
  componentId: string,
  updater: (component: MealComponentSnapshot) => MealComponentSnapshot,
): ComboCandidateSnapshot {
  let found = false
  const components = candidate.components.map((component) => {
    if (component.id !== componentId) {
      return component
    }
    found = true
    return updater(component)
  })

  if (!found) {
    throw new Error(`部件不存在: ${componentId}`)
  }
  return { ...candidate, components }
}

export function withComponentEaten(
  candidate: ComboCandidateSnapshot,
  componentId: string,
  eaten: boolean,
): ComboCandidateSnapshot {
  return updateComponent(candidate, componentId, (component) => {
    if (component.discarded) {
      throw new Error('已舍弃的部件不能勾选')
    }
    return { ...component, eaten }
  })
}

function ingredientKey(
  item: ComponentIngredientSnapshot,
  index: number,
): string {
  return item.ingredientId ?? String(index)
}

export function scaleComponentToTotal(
  component: MealComponentSnapshot,
  totalGrams: number,
): MealComponentSnapshot {
  if (component.kind === 'custom' || component.ingredients.length === 0) {
    throw new Error('这个部件没有可调整的食材')
  }
  assertNonNegative(totalGrams, component.name)

  const currentTotal = component.ingredients.reduce(
    (sum, item) => sum + item.grams,
    0,
  )
  const ingredients =
    currentTotal === 0
      ? component.ingredients.map((item) => ({ ...item, grams: 0 }))
      : component.ingredients.map((item) => ({
          ...item,
          grams: roundGrams((item.grams / currentTotal) * totalGrams),
        }))
  const grams = currentTotal === 0 ? 0 : roundGrams(totalGrams)

  return {
    ...component,
    ingredients,
    grams,
    calories: sumIngredientKcal(ingredients),
  }
}

export function withComponentIngredientGrams(
  component: MealComponentSnapshot,
  overrides: Readonly<Record<string, number>>,
): MealComponentSnapshot {
  if (component.kind === 'custom' || component.ingredients.length === 0) {
    throw new Error('这个部件没有可调整的食材')
  }

  const acceptedKeys = new Set(
    component.ingredients.map((item, index) => ingredientKey(item, index)),
  )
  for (const key of Object.keys(overrides)) {
    if (!acceptedKeys.has(key)) {
      throw new Error(`食材不在部件中: ${key}（部件 ${component.name}）`)
    }
  }

  const ingredients = component.ingredients.map((item, index) => {
    const grams = overrides[ingredientKey(item, index)] ?? item.grams
    assertNonNegative(grams, `${item.name}（部件 ${component.name}）`)
    return { ...item, grams }
  })

  return {
    ...component,
    ingredients,
    grams: roundGrams(
      ingredients.reduce((sum, item) => sum + item.grams, 0),
    ),
    calories: sumIngredientKcal(ingredients),
  }
}

/** 更新自定义记录的热量；库内部件走食材克数重算。 */
export function withCustomComponentCalories(
  component: MealComponentSnapshot,
  calories: number | null,
): MealComponentSnapshot {
  if (component.kind !== 'custom') {
    throw new Error('只有自定义记录可以直接修改热量')
  }
  return { ...component, calories: normalizeCalories(calories) }
}

export function addDishComponent(
  candidate: ComboCandidateSnapshot,
  dish: Dish,
  meal: MealType,
  options: SnapshotCatalogOptions = {},
): ComboCandidateSnapshot {
  if (!dish.meals.includes(meal)) {
    throw new Error('这道菜不支持当前餐次')
  }

  const activeDishIds = new Set(
    candidate.components
      .filter((component) => !component.discarded && component.kind === 'dish')
      .map((component) => component.dishId),
  )
  if (activeDishIds.has(dish.id)) {
    throw new Error('这个套餐里已经有这道菜了')
  }
  if (dish.rarity === 'UR' && candidate.rarity !== 'UR') {
    throw new Error('非 UR 套餐不能手动添加 UR 菜品')
  }

  const usedIds = new Set(candidate.components.map((component) => component.id))
  const componentId = createComponentId('manual', dish.id, usedIds)
  const component = createDishComponent(dish, 'manual', componentId, {
    ingredientById: options.ingredientById,
  })

  return {
    ...candidate,
    components: [...candidate.components, component],
  }
}

export function addCustomComponent(
  candidate: ComboCandidateSnapshot,
  input: CustomComponentInput,
): ComboCandidateSnapshot {
  const usedIds = new Set(candidate.components.map((component) => component.id))
  const componentId = createComponentId('custom', input.name, usedIds)
  return {
    ...candidate,
    components: [
      ...candidate.components,
      createCustomComponent(input, componentId),
    ],
  }
}

export function discardComponent(
  candidate: ComboCandidateSnapshot,
  componentId: string,
): ComboCandidateSnapshot {
  const component = findComponent(candidate, componentId)
  if (component.discarded) {
    throw new Error('这个部件已经舍弃了')
  }

  const activeCount = candidate.components.filter(
    (item) => !item.discarded,
  ).length
  if (activeCount <= 1) {
    throw new Error('至少要保留一个部件')
  }

  return updateComponent(candidate, componentId, (item) => ({
    ...item,
    discarded: true,
  }))
}

export function restoreComponent(
  candidate: ComboCandidateSnapshot,
  componentId: string,
): ComboCandidateSnapshot {
  const component = findComponent(candidate, componentId)
  if (!component.discarded) {
    throw new Error('这个部件没有被舍弃')
  }

  if (
    component.kind === 'dish' &&
    candidate.components.some(
      (item) =>
        item.id !== componentId &&
        !item.discarded &&
        item.kind === 'dish' &&
        item.dishId === component.dishId,
    )
  ) {
    throw new Error('这个套餐里已经有这道菜了')
  }

  return updateComponent(candidate, componentId, (item) => ({
    ...item,
    discarded: false,
  }))
}

export function replaceComponent(
  candidate: ComboCandidateSnapshot,
  componentId: string,
  replacement: MealComponentSnapshot,
): ComboCandidateSnapshot {
  findComponent(candidate, componentId)

  if (
    replacement.id !== componentId &&
    candidate.components.some((item) => item.id === replacement.id)
  ) {
    throw new Error(`部件 id 冲突: ${replacement.id}`)
  }

  return {
    ...candidate,
    components: candidate.components.map((item) =>
      item.id === componentId ? replacement : item,
    ),
  }
}

export function calcMealCalories(
  components: readonly MealComponentSnapshot[],
): number | null {
  let total = 0
  let hasValue = false

  for (const component of components) {
    if (component.discarded || !component.eaten || component.calories === null) {
      continue
    }
    total += component.calories
    hasValue = true
  }

  return hasValue ? Math.round(total) : null
}

/**
 * 已吃库内部件的 dishId，按出现顺序在同一餐内去重。
 * 不查实时菜品库：历史/归档/自制菜的快照同样保留。
 */
export function getEatenDishIds(
  components: readonly MealComponentSnapshot[],
): string[] {
  const ids: string[] = []
  const seen = new Set<string>()

  for (const component of components) {
    if (
      component.kind !== 'dish' ||
      component.discarded ||
      !component.eaten ||
      component.dishId === null ||
      seen.has(component.dishId)
    ) {
      continue
    }
    seen.add(component.dishId)
    ids.push(component.dishId)
  }

  return ids
}

/** 正式发放印章时只接受仍在官方菜品库里的菜。 */
export function getEatenStampDishIds(
  components: readonly MealComponentSnapshot[],
  dishCatalog: ReadonlyMap<string, unknown> = defaultDishById,
): string[] {
  return getEatenDishIds(components).filter((dishId) =>
    dishCatalog.has(dishId),
  )
}

export function hasEatenLibraryComponent(
  components: readonly MealComponentSnapshot[],
): boolean {
  return components.some(
    (component) =>
      component.kind === 'dish' && !component.discarded && component.eaten,
  )
}
