import { describe, expect, it } from 'vitest'

import { mealKcalRange } from '@/config/gameConfig'
import { calcDishCalories } from '@/core/nutrition'
import type { DishCategory, MealType } from '@/core/types'

import {
  comboProvides,
  countUnicodeChars,
  isBreakfastOnly,
  isRedrawCandidate,
  isSideOnlyCategory,
  requiresHeatThroughHint,
} from './dataRules'
import { combos, dishById, dishes } from './index'

const REDRAW_CATEGORIES: readonly DishCategory[] = [
  'staple',
  'main',
  'soup',
  'veg',
]
const REDRAW_MEALS: readonly MealType[] = ['lunch', 'dinner']
const MIN_REDRAW_CANDIDATES = 5

function comboKcal(components: readonly string[]): number {
  return components.reduce(
    (sum, dishId) => sum + calcDishCalories(dishById.get(dishId)!),
    0,
  )
}

describe('meal composition rules', () => {
  it('keeps every non-UR combo inside its meal calorie range', () => {
    for (const combo of combos) {
      const total = comboKcal(combo.components)
      for (const meal of combo.meals) {
        const range = mealKcalRange[meal]
        const failures: string[] = []
        if (total < range.min) {
          failures.push(`低于 ${meal} 下限 ${range.min}`)
        }
        if (combo.rarity !== 'UR' && total > range.max) {
          failures.push(`超过 ${meal} 上限 ${range.max}`)
        }
        expect(
          failures,
          `${combo.id} ${combo.name} 热量 ${total}：${failures.join('，')}`,
        ).toEqual([])
      }
    }
  })

  it('keeps breakfast-only dishes out of lunch and dinner pools', () => {
    const breakfastOnly = dishes.filter(isBreakfastOnly)
    expect(breakfastOnly.length).toBeGreaterThan(0)

    for (const dish of breakfastOnly) {
      for (const meal of REDRAW_MEALS) {
        expect(
          isRedrawCandidate(dish, meal, dish.category),
          `${dish.id} 早餐专属，却出现在 ${meal} 重抽候选`,
        ).toBe(false)
      }
      const usedBy = combos.filter(
        (combo) =>
          combo.components.includes(dish.id) &&
          (combo.meals.includes('lunch') || combo.meals.includes('dinner')),
      )
      expect(usedBy.map((combo) => combo.id), `${dish.id} 被午晚餐套餐引用`).toEqual(
        [],
      )
    }
  })

  it('requires a staple and a protein in every lunch combo', () => {
    for (const combo of combos.filter((item) =>
      item.meals.includes('lunch'),
    )) {
      expect(
        comboProvides(combo, dishById, 'providesStaple'),
        `${combo.id} 午餐没有主食`,
      ).toBe(true)
      expect(
        comboProvides(combo, dishById, 'providesProtein'),
        `${combo.id} 午餐没有蛋白质`,
      ).toBe(true)
    }
  })

  it('does not let fruit, drinks or snacks form a one-component combo', () => {
    for (const combo of combos) {
      if (combo.components.length !== 1) continue
      const dish = dishById.get(combo.components[0])!
      expect(
        isSideOnlyCategory(dish.category),
        `${combo.id} 只有一份${dish.category}，不能单独成餐`,
      ).toBe(false)
    }
  })

  it('offers at least five non-UR redraw candidates per lunch/dinner category', () => {
    for (const meal of REDRAW_MEALS) {
      for (const category of REDRAW_CATEGORIES) {
        const pool = dishes.filter((dish) =>
          isRedrawCandidate(dish, meal, category),
        )
        expect(
          pool.length,
          `${meal}/${category} 只有 ${pool.length} 道非 UR 候选`,
        ).toBeGreaterThanOrEqual(MIN_REDRAW_CANDIDATES)
      }
    }
  })

  it('keeps combo names short and neutral', () => {
    const shameWords = [
      '胖',
      '丑',
      '瘦',
      '减肥',
      '减脂',
      '低卡',
      '节食',
      '轻断食',
      '罪恶',
      '暴食',
      '焦虑',
      '热量',
      '卡路里',
      '自律',
      '身材',
    ]
    for (const combo of combos) {
      expect(
        countUnicodeChars(combo.name),
        `${combo.id} 名称超过 10 字`,
      ).toBeLessThanOrEqual(10)
      for (const word of shameWords) {
        expect(combo.name, `${combo.id} 名称含“${word}”`).not.toContain(word)
      }
    }
  })

  it('gives meat, egg and seafood dishes a heat-through hint', () => {
    for (const dish of dishes.filter(requiresHeatThroughHint)) {
      expect(
        dish.cooking?.steps.some((step) => step.includes('熟透')),
        `${dish.id} 含肉蛋海鲜，但做法没有“熟透”`,
      ).toBe(true)
    }
  })
})
