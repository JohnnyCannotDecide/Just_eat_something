import { describe, expect, it } from 'vitest'

import { DRAW_LIMITS } from '@/config/gameConfig'

import {
  consumeDraw,
  createMealDrawBudget,
  getDrawAllowance,
  markMealCheckedIn,
} from './drawBudget'
import type { MealDrawBudget } from './drawBudget'

describe('drawBudget', () => {
  it('consumes base draws → tokens → ads in order', () => {
    let budget = createMealDrawBudget()
    let tokenCount = 1
    const sources = []

    for (let i = 0; i < 6; i += 1) {
      const result = consumeDraw(budget, tokenCount)
      sources.push(result.source)
      budget = result.budget
      tokenCount = result.tokenCount
    }

    expect(sources).toEqual(['base', 'base', 'token', 'ad', 'ad', 'ad'])
    expect(budget).toEqual({ baseUsed: 2, adUsed: 3, checkedIn: false })
    expect(tokenCount).toBe(0)
  })

  it('never caps ad draws per meal', () => {
    const budget: MealDrawBudget = {
      ...createMealDrawBudget(),
      baseUsed: DRAW_LIMITS.basePerMeal,
      adUsed: 10,
    }

    expect(getDrawAllowance(budget, 0)).toMatchObject({
      canDraw: true,
      nextSource: 'ad',
      remainingAds: null,
    })

    const result = consumeDraw(budget, 0)
    expect(result.source).toBe('ad')
    expect(result.budget.adUsed).toBe(11)
  })

  it('reports remaining counts from the current budget', () => {
    const budget: MealDrawBudget = {
      baseUsed: 1,
      adUsed: 2,
      checkedIn: false,
    }

    expect(getDrawAllowance(budget, 2)).toEqual({
      canDraw: true,
      nextSource: 'base',
      remainingBase: 1,
      remainingTokens: 2,
      remainingAds: null,
      totalRemaining: null,
    })
  })

  it('skips to ads when no tokens are available', () => {
    const budget: MealDrawBudget = {
      ...createMealDrawBudget(),
      baseUsed: DRAW_LIMITS.basePerMeal,
    }

    const result = consumeDraw(budget, 0)
    expect(result.source).toBe('ad')
    expect(result.budget.adUsed).toBe(1)
    expect(result.tokenCount).toBe(0)
  })

  it('locks the meal after check-in even when tokens remain', () => {
    const budget = markMealCheckedIn(createMealDrawBudget())
    const allowance = getDrawAllowance(budget, 5)

    expect(allowance).toEqual({
      canDraw: false,
      nextSource: null,
      remainingBase: 0,
      remainingTokens: 0,
      remainingAds: 0,
      totalRemaining: 0,
    })
    expect(() => consumeDraw(budget, 5)).toThrow('本餐已打卡')
  })

  it('never reports negative remaining counts', () => {
    const budget: MealDrawBudget = {
      baseUsed: 99,
      adUsed: 99,
      checkedIn: false,
    }

    const allowance = getDrawAllowance(budget, 0)
    expect(allowance.remainingBase).toBe(0)
    expect(allowance.remainingTokens).toBe(0)
    expect(allowance.remainingAds).toBeNull()
    expect(allowance.canDraw).toBe(true)
    expect(allowance.nextSource).toBe('ad')
  })
})
