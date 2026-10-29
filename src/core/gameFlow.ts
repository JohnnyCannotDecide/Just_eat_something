import { componentRedrawCostsDraw } from '@/config/gameConfig'
import {
  combos as defaultComboCatalog,
  dishById as defaultDishById,
  dishes as defaultDishCatalog,
} from '@/data'

import {
  calcComponentCalories,
  calcMealCalories,
  createComponentId,
  createDishComponent,
  getComponentTotalGrams,
  getEatenStampDishIds,
  hasEatenLibraryComponent,
  replaceComponent,
  withComponentIngredientGrams,
} from './components'
import { consumeDraw, getDrawAllowance, markMealCheckedIn } from './drawBudget'
import type { DrawSource, MealDrawBudget } from './drawBudget'
import { drawByRarity } from './draw'
import type { Rng } from './draw'
import { grantCheckInToken } from './tokens'
import type { TokenWallet } from './tokens'
import type {
  Combo,
  ComboCandidateSnapshot,
  Dish,
  DishCategory,
  Ingredient,
  MealComponentSnapshot,
  MealType,
} from './types'

export type DrawBlockedReason = 'checked-in' | 'pool-empty'

export interface MealDrawInput {
  meal: MealType
  budget: MealDrawBudget
  tokenCount: number
  pityCount: number
  /** 本轮已经抽到的套餐 id；耗尽后由 drawForMeal 洗牌重置。 */
  drawnComboIds: readonly string[]
}

export interface MealDrawOptions {
  rng?: Rng
  catalog?: readonly Combo[]
  /** 广告已完整看完；只有此时才允许消耗广告次数。 */
  adCompleted?: boolean
}

export type MealDrawResult =
  | {
      status: 'drawn'
      combo: Combo
      source: DrawSource
      budget: MealDrawBudget
      tokenCount: number
      pityCount: number
      pityTriggered: boolean
      shuffled: boolean
      singleCandidate: boolean
      nextDrawnComboIds: string[]
    }
  | { status: 'requires-ad' }
  | { status: 'blocked'; reason: DrawBlockedReason }

function uniqueIds(ids: readonly string[]): string[] {
  return [...new Set(ids)]
}

/**
 * 一次套餐抽卡请求：先按 core 的次数顺序判定来源，再消耗次数并抽卡。
 * 广告来源必须先看完整广告；未完成时只返回 requires-ad，不写任何状态。
 * 当前轮抽完后洗牌继续，不阻断；洗牌时避开上一份套餐。
 */
export function drawForMeal(
  input: MealDrawInput,
  options: MealDrawOptions = {},
): MealDrawResult {
  const allowance = getDrawAllowance(input.budget, input.tokenCount)

  if (!allowance.canDraw) {
    return { status: 'blocked', reason: 'checked-in' }
  }

  if (allowance.nextSource === 'ad' && !options.adCompleted) {
    return { status: 'requires-ad' }
  }

  const catalog = options.catalog ?? defaultComboCatalog
  const pool = catalog.filter((combo) => combo.meals.includes(input.meal))
  if (pool.length === 0) {
    return { status: 'blocked', reason: 'pool-empty' }
  }

  const round = uniqueIds(input.drawnComboIds)
  const seen = new Set(round)
  const exhausted = pool.every((combo) => seen.has(combo.id))

  let candidates: Combo[]
  let shuffled = false
  let singleCandidate = false
  if (exhausted) {
    shuffled = true
    const previous = [...round]
      .reverse()
      .find((id) => pool.some((combo) => combo.id === id))
    const withoutPrevious = previous
      ? pool.filter((combo) => combo.id !== previous)
      : pool
    if (withoutPrevious.length === 0) {
      candidates = pool
      singleCandidate = true
    } else {
      candidates = withoutPrevious
    }
  } else {
    candidates = pool.filter((combo) => !seen.has(combo.id))
  }

  const draw = drawByRarity(candidates, input.pityCount, options.rng)
  const consumed = consumeDraw(input.budget, input.tokenCount)

  return {
    status: 'drawn',
    combo: draw.item,
    source: consumed.source,
    budget: consumed.budget,
    tokenCount: consumed.tokenCount,
    pityCount: draw.pityCount,
    pityTriggered: draw.pityTriggered,
    shuffled,
    singleCandidate,
    nextDrawnComboIds: exhausted
      ? [draw.item.id]
      : [...round, draw.item.id],
  }
}

export interface RedrawComponentOptions {
  rng?: Rng
  dishCatalog?: readonly Dish[]
  ingredientCatalog?: ReadonlyMap<string, Ingredient>
  /** 默认读 gameConfig.componentRedrawCostsDraw；测试可覆盖。 */
  costsDraw?: boolean
  adCompleted?: boolean
}

export type RedrawComponentResult =
  | {
      status: 'redrawn'
      candidate: ComboCandidateSnapshot
      component: MealComponentSnapshot
      source: DrawSource | null
      budget: MealDrawBudget
      tokenCount: number
      pityCount: number
      pityTriggered: boolean
      shuffled: boolean
      singleCandidate: boolean
    }
  | { status: 'requires-ad' }
  | {
      status: 'blocked'
      reason: 'checked-in' | 'component-missing' | 'not-redrawable'
    }
  | { status: 'no-candidate'; reason: 'single-candidate' }

function activeDishIds(candidate: ComboCandidateSnapshot): Set<string> {
  const ids = new Set<string>()
  for (const component of candidate.components) {
    if (
      component.kind === 'dish' &&
      !component.discarded &&
      component.dishId !== null
    ) {
      ids.add(component.dishId)
    }
  }
  return ids
}

/**
 * 重抽一个套餐部件：只从同餐次、同分类、非 UR、且不与当前活动部件重复的
 * 菜品中选择。次数判定与保底复用抽卡逻辑；失败时绝不消耗次数或改保底。
 */
export function redrawComponent(
  input: {
    meal: MealType
    candidate: ComboCandidateSnapshot
    componentId: string
    budget: MealDrawBudget
    tokenCount: number
    pityCount: number
  },
  options: RedrawComponentOptions = {},
): RedrawComponentResult {
  if (input.budget.checkedIn) {
    return { status: 'blocked', reason: 'checked-in' }
  }

  const target = input.candidate.components.find(
    (component) => component.id === input.componentId,
  )
  if (!target || target.discarded) {
    return { status: 'blocked', reason: 'component-missing' }
  }
  if (
    target.kind === 'custom' ||
    target.dishId === null ||
    target.category === null
  ) {
    return { status: 'blocked', reason: 'not-redrawable' }
  }

  const category: DishCategory = target.category
  const dishCatalog = options.dishCatalog ?? defaultDishCatalog
  const activeIds = activeDishIds(input.candidate)
  const eligible = dishCatalog.filter(
    (dish) =>
      dish.meals.includes(input.meal) &&
      dish.category === category &&
      dish.rarity !== 'UR' &&
      !activeIds.has(dish.id),
  )

  if (eligible.length === 0) {
    return { status: 'no-candidate', reason: 'single-candidate' }
  }

  const slotSeen = uniqueIds([
    ...(target.seenDishIds ?? []),
    target.dishId,
  ])
  const seen = new Set(slotSeen)
  let candidates = eligible.filter((dish) => !seen.has(dish.id))
  let shuffled = false
  let nextSeen: string[] = slotSeen

  if (candidates.length === 0) {
    shuffled = true
    nextSeen = [target.dishId]
    const previous = slotSeen.at(-2)
    const withoutPrevious =
      previous !== undefined
        ? eligible.filter((dish) => dish.id !== previous)
        : eligible
    if (withoutPrevious.length === 0) {
      return { status: 'no-candidate', reason: 'single-candidate' }
    }
    candidates = withoutPrevious
  }

  const costsDraw = options.costsDraw ?? componentRedrawCostsDraw
  let source: DrawSource | null = null
  let budget = input.budget
  let tokenCount = input.tokenCount
  let pityCount = input.pityCount
  let pityTriggered = false

  if (costsDraw) {
    const allowance = getDrawAllowance(input.budget, input.tokenCount)
    if (!allowance.canDraw) {
      return { status: 'blocked', reason: 'checked-in' }
    }
    if (allowance.nextSource === 'ad' && !options.adCompleted) {
      return { status: 'requires-ad' }
    }

    const draw = drawByRarity(candidates, input.pityCount, options.rng)
    const consumed = consumeDraw(input.budget, input.tokenCount)
    source = consumed.source
    budget = consumed.budget
    tokenCount = consumed.tokenCount
    pityCount = draw.pityCount
    pityTriggered = draw.pityTriggered
    candidates = [draw.item]
  } else {
    // 免费重抽不扣次数、不改保底，也不利用保底选择稀有度。
    const draw = drawByRarity(candidates, 0, options.rng)
    source = null
    pityTriggered = false
    pityCount = input.pityCount
    candidates = [draw.item]
  }

  const drawnDish = candidates[0]!
  const usedIds = new Set(
    input.candidate.components.map((component) => component.id),
  )
  const componentId = createComponentId('redraw', drawnDish.id, usedIds)
  const component = createDishComponent(drawnDish, 'redraw', componentId, {
    ingredientById: options.ingredientCatalog,
    seenDishIds: uniqueIds([...nextSeen, drawnDish.id]),
  })
  const candidate = replaceComponent(
    input.candidate,
    input.componentId,
    component,
  )

  return {
    status: 'redrawn',
    candidate,
    component,
    source,
    budget,
    tokenCount,
    pityCount,
    pityTriggered,
    shuffled,
    singleCandidate: false,
  }
}

export interface CheckInMealInput {
  candidate: ComboCandidateSnapshot
  budget: MealDrawBudget
  wallet: TokenWallet
  dateKey: string
  /** componentId → 是否吃了；缺省沿用快照。 */
  eaten?: Readonly<Record<string, boolean>>
  /** componentId → ingredientKey → 实际克数。 */
  ingredientGrams?: Readonly<
    Record<string, Readonly<Record<string, number>>>
  >
  /** componentId → 自定义记录热量；null 表示不计入。 */
  customCalories?: Readonly<Record<string, number | null>>
  dishCatalog?: ReadonlyMap<string, unknown>
}

export type CheckInMealResult =
  | {
      status: 'checked-in'
      components: MealComponentSnapshot[]
      calories: number | null
      stampDishIds: string[]
      budget: MealDrawBudget
      wallet: TokenWallet
      tokenRewarded: boolean
      rewardKind: 'formal' | 'custom'
    }
  | { status: 'blocked'; reason: 'checked-in' | 'no-components' | 'no-eaten' }

function normalizeCustomCalories(value: number | null): number | null {
  if (value === null) {
    return null
  }
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError('热量必须是非负有限数')
  }
  return Math.round(value)
}

/**
 * 一餐的统一结算：应用勾选/克数覆盖，去掉已舍弃部件，重算热量与印章。
 * 每个已吃库内部件各记一次印章，同餐同菜只记一次；自定义记录不产生印章。
 */
export function checkInMeal(input: CheckInMealInput): CheckInMealResult {
  if (input.budget.checkedIn) {
    return { status: 'blocked', reason: 'checked-in' }
  }

  const active = input.candidate.components.filter(
    (component) => !component.discarded,
  )
  if (active.length === 0) {
    return { status: 'blocked', reason: 'no-components' }
  }

  const finalComponents = active.map((component) => {
    let next = component
    const eaten = input.eaten?.[component.id]
    if (eaten !== undefined) {
      next = { ...next, eaten }
    }

    if (next.kind === 'dish') {
      const grams = input.ingredientGrams?.[component.id]
      if (grams) {
        next = withComponentIngredientGrams(next, grams)
      } else {
        next = {
          ...next,
          grams: getComponentTotalGrams(next),
          // 直接热量模式的自制菜没有食材行，保留快照上的总热量。
          calories:
            next.ingredients.length > 0
              ? calcComponentCalories(next)
              : next.calories,
        }
      }
    } else {
      const calories = input.customCalories?.[component.id]
      if (calories !== undefined) {
        next = { ...next, calories: normalizeCustomCalories(calories) }
      }
    }

    return next
  })

  if (!finalComponents.some((component) => component.eaten)) {
    return { status: 'blocked', reason: 'no-eaten' }
  }

  const rewardKind = hasEatenLibraryComponent(finalComponents)
    ? 'formal'
    : 'custom'
  const token = grantCheckInToken(input.wallet, rewardKind, input.dateKey)

  return {
    status: 'checked-in',
    components: finalComponents,
    calories: calcMealCalories(finalComponents),
    stampDishIds: getEatenStampDishIds(
      finalComponents,
      input.dishCatalog ?? defaultDishById,
    ),
    budget: markMealCheckedIn(input.budget),
    wallet: token.wallet,
    tokenRewarded: token.rewarded,
    rewardKind,
  }
}
