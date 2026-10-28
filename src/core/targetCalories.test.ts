import { describe, expect, it } from 'vitest'

import { calcBmr, calcTargetCalories } from './targetCalories'
import type {
  ActivityLevel,
  BodyProfile,
  CalorieGoal,
  Sex,
} from './types'

const female: BodyProfile = {
  sex: 'female',
  age: 30,
  heightCm: 165,
  weightKg: 60,
  activity: 'sedentary',
  goal: 'maintain',
}

const male: BodyProfile = {
  sex: 'male',
  age: 30,
  heightCm: 180,
  weightKg: 80,
  activity: 'sedentary',
  goal: 'maintain',
}

describe('calcBmr', () => {
  it('uses the Mifflin-St Jeor formula for women', () => {
    expect(calcBmr(female)).toBeCloseTo(1320.25, 5)
  })

  it('uses the Mifflin-St Jeor formula for men', () => {
    expect(calcBmr(male)).toBe(1780)
  })

  it('rejects invalid body data', () => {
    expect(() => calcBmr({ ...female, age: 0 })).toThrow(RangeError)
    expect(() => calcBmr({ ...female, heightCm: -1 })).toThrow(RangeError)
    expect(() => calcBmr({ ...female, weightKg: Number.NaN })).toThrow(RangeError)
    expect(() => calcBmr({ ...female, weightKg: Number.POSITIVE_INFINITY })).toThrow(RangeError)
    expect(() => calcBmr({ ...female, sex: 'other' as Sex })).toThrow(RangeError)
  })
})

describe('calcTargetCalories', () => {
  it('applies the activity factor for maintenance', () => {
    expect(calcTargetCalories(female)).toBe(1584)
  })

  it('applies the goal adjustment', () => {
    // 1780 × 1.55 × 1.1 = 3034.9 → 3035
    expect(
      calcTargetCalories({ ...male, activity: 'moderate', goal: 'gain' }),
    ).toBe(3035)
  })

  it('clamps to the female safety floor', () => {
    expect(
      calcTargetCalories({
        ...female,
        age: 30,
        heightCm: 155,
        weightKg: 45,
        goal: 'cut',
      }),
    ).toBe(1200)
  })

  it('clamps to the male safety floor', () => {
    expect(
      calcTargetCalories({
        ...male,
        age: 40,
        heightCm: 160,
        weightKg: 50,
        goal: 'cut',
      }),
    ).toBe(1500)
  })

  it('uses a valid manual target as-is', () => {
    expect(
      calcTargetCalories({ ...female, goal: 'cut', manualTargetKcal: 1000 }),
    ).toBe(1000)
    expect(
      calcTargetCalories({ ...female, manualTargetKcal: 1500.6 }),
    ).toBe(1501)
  })

  it('treats null/undefined manual targets as unset', () => {
    expect(calcTargetCalories({ ...female, manualTargetKcal: undefined })).toBe(1584)
    expect(
      calcTargetCalories({
        ...female,
        manualTargetKcal: null as unknown as number,
      }),
    ).toBe(1584)
  })

  it('rejects invalid manual targets', () => {
    expect(() => calcTargetCalories({ ...female, manualTargetKcal: 0 })).toThrow(RangeError)
    expect(() => calcTargetCalories({ ...female, manualTargetKcal: -10 })).toThrow(RangeError)
    expect(() => calcTargetCalories({ ...female, manualTargetKcal: Number.NaN })).toThrow(
      RangeError,
    )
    expect(() =>
      calcTargetCalories({ ...female, manualTargetKcal: Number.POSITIVE_INFINITY }),
    ).toThrow(RangeError)
  })

  it('rejects unknown activity levels and goals', () => {
    expect(() =>
      calcTargetCalories({ ...female, activity: 'extreme' as ActivityLevel }),
    ).toThrow(RangeError)
    expect(() =>
      calcTargetCalories({ ...female, goal: 'bulk' as CalorieGoal }),
    ).toThrow(RangeError)
    expect(() => calcTargetCalories({ ...female, sex: 'other' as Sex })).toThrow(
      RangeError,
    )
  })
})
