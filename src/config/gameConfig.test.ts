import { describe, expect, it } from 'vitest'

import {
  ACTIVITY_LEVELS,
  AD,
  BMR_FORMULA,
  CALORIE_SAFETY_FLOOR,
  DRAW_LIMITS,
  DRAW_SOURCE_ORDER,
  GOAL_ADJUSTMENTS,
  GOAL_META,
  MEALS,
  PITY,
  RARITY_WEIGHTS,
  STAMP_DISPLAY,
  STAMP_TIERS,
  STAMP_TIER_META,
  TOKEN_REWARDS,
  componentRedrawCostsDraw,
  customDishAllowedRarities,
} from './gameConfig'

describe('gameConfig', () => {
  it('keeps the rarity weights at 100', () => {
    const total = Object.values(RARITY_WEIGHTS).reduce((sum, value) => sum + value, 0)
    expect(total).toBe(100)
  })

  it('mirrors the spec rules', () => {
    expect(RARITY_WEIGHTS).toEqual({ R: 55, SR: 28, SSR: 14, UR: 3 })
    expect(PITY.missThreshold).toBe(5)
    expect(PITY.guaranteedRarities).toEqual(['SR', 'SSR', 'UR'])
    expect(DRAW_LIMITS.basePerMeal).toBe(2)
    expect(DRAW_LIMITS.adBonusPerMeal).toBe(3)
    expect(DRAW_LIMITS.tokenValidDays).toBe(1)
    expect(DRAW_SOURCE_ORDER).toEqual(['base', 'token', 'ad'])
    expect(TOKEN_REWARDS.formalDish).toBe(1)
    expect(TOKEN_REWARDS.customRecordFirstPerDay).toBe(1)
    expect(AD.mockCountdownSeconds).toBe(5)
  })

  it('keeps combo component rules configurable', () => {
    expect(componentRedrawCostsDraw).toBe(true)
    expect(STAMP_DISPLAY).toEqual({ maxInline: 4 })
  })

  it('limits custom dish rarities to a configurable allow list', () => {
    expect(customDishAllowedRarities).toEqual(['R', 'SR'])
  })

  it('keeps stamp tiers ordered and the three meals defined', () => {
    expect(STAMP_TIERS.map((tier) => tier.minCount)).toEqual([1, 3, 7])
    expect(MEALS.map((meal) => meal.type)).toEqual(['breakfast', 'lunch', 'dinner'])
  })

  it('provides complete goal and stamp-tier display meta', () => {
    expect(Object.keys(GOAL_META)).toEqual(['cut', 'maintain', 'gain'])
    expect(Object.keys(STAMP_TIER_META)).toEqual(['bronze', 'silver', 'gold'])
    for (const meta of Object.values(STAMP_TIER_META)) {
      expect(meta.color).toMatch(/^#[0-9A-Fa-f]{6}$/)
      expect(meta.soft).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })

  it('keeps calorie safety floors and goal adjustments', () => {
    expect(CALORIE_SAFETY_FLOOR).toEqual({ female: 1200, male: 1500 })
    expect(GOAL_ADJUSTMENTS).toEqual({ cut: -0.15, maintain: 0, gain: 0.1 })
  })

  it('keeps the BMR formula and activity factors', () => {
    expect(BMR_FORMULA).toEqual({
      weightKgFactor: 10,
      heightCmFactor: 6.25,
      ageFactor: 5,
      sexOffset: { female: -161, male: 5 },
    })
    expect(ACTIVITY_LEVELS.map((level) => level.factor)).toEqual([
      1.2, 1.375, 1.55, 1.725, 1.9,
    ])
  })
})
