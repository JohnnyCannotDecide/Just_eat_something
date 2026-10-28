import { DRAW_LIMITS, DRAW_SOURCE_ORDER } from '@/config/gameConfig'

export type DrawSource = (typeof DRAW_SOURCE_ORDER)[number]

/** 餐次内已经消耗的基础/广告次数；抽卡券数量放在全局日钱包。 */
export interface MealDrawBudget {
  baseUsed: number
  adUsed: number
  checkedIn: boolean
}

export interface DrawAllowance {
  canDraw: boolean
  nextSource: DrawSource | null
  remainingBase: number
  remainingTokens: number
  remainingAds: number
  totalRemaining: number
}

export interface ConsumeDrawResult {
  budget: MealDrawBudget
  tokenCount: number
  source: DrawSource
}

export function createMealDrawBudget(): MealDrawBudget {
  return { baseUsed: 0, adUsed: 0, checkedIn: false }
}

export function markMealCheckedIn(budget: MealDrawBudget): MealDrawBudget {
  return { ...budget, checkedIn: true }
}

function normalizeCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
}

export function getDrawAllowance(
  budget: MealDrawBudget,
  tokenCount: number,
): DrawAllowance {
  if (budget.checkedIn) {
    return {
      canDraw: false,
      nextSource: null,
      remainingBase: 0,
      remainingTokens: 0,
      remainingAds: 0,
      totalRemaining: 0,
    }
  }

  const remainingBase = Math.max(
    0,
    DRAW_LIMITS.basePerMeal - normalizeCount(budget.baseUsed),
  )
  const remainingAds = Math.max(
    0,
    DRAW_LIMITS.adBonusPerMeal - normalizeCount(budget.adUsed),
  )
  const remainingTokens = normalizeCount(tokenCount)

  const remainingBySource: Record<DrawSource, number> = {
    base: remainingBase,
    token: remainingTokens,
    ad: remainingAds,
  }
  const nextSource =
    DRAW_SOURCE_ORDER.find((source) => remainingBySource[source] > 0) ?? null

  return {
    canDraw: nextSource !== null,
    nextSource,
    remainingBase,
    remainingTokens,
    remainingAds,
    totalRemaining: remainingBase + remainingTokens + remainingAds,
  }
}

export function consumeDraw(
  budget: MealDrawBudget,
  tokenCount: number,
): ConsumeDrawResult {
  const allowance = getDrawAllowance(budget, tokenCount)
  const source = allowance.nextSource

  if (!source) {
    throw new Error(
      budget.checkedIn ? '本餐已打卡，不能继续抽卡' : '没有可用的抽卡次数',
    )
  }

  const normalizedTokens = normalizeCount(tokenCount)

  switch (source) {
    case 'base':
      return {
        budget: {
          ...budget,
          baseUsed: normalizeCount(budget.baseUsed) + 1,
        },
        tokenCount: normalizedTokens,
        source,
      }
    case 'token':
      return {
        budget: { ...budget },
        tokenCount: normalizedTokens - 1,
        source,
      }
    case 'ad':
      return {
        budget: {
          ...budget,
          adUsed: normalizeCount(budget.adUsed) + 1,
        },
        tokenCount: normalizedTokens,
        source,
      }
  }

  throw new Error(`未知的抽卡来源: ${String(source)}`)
}
