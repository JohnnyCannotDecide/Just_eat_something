import { describe, expect, it } from 'vitest'

import { formatKcal, isCaloriesVisible } from './formatKcal'

const PROFILE = {
  sex: 'female',
  age: 30,
  heightCm: 165,
  weightKg: 60,
  activity: 'sedentary',
  goal: 'maintain',
} as const

describe('formatKcal', () => {
  it('rounds visible numbers to whole calories', () => {
    expect(formatKcal(232, true)).toBe('232')
    expect(formatKcal(231.6, true)).toBe('232')
    expect(formatKcal(0, true)).toBe('0')
  })

  it('hides the value when the switch is off', () => {
    expect(formatKcal(232, false)).toBe('?')
  })

  it('returns a question mark for missing or invalid values', () => {
    expect(formatKcal(null, true)).toBe('?')
    expect(formatKcal(undefined, true)).toBe('?')
    expect(formatKcal(Number.NaN, true)).toBe('?')
    expect(formatKcal(Number.POSITIVE_INFINITY, true)).toBe('?')
    expect(formatKcal(null, false)).toBe('?')
  })
})

describe('isCaloriesVisible', () => {
  it('requires both a profile and the switch', () => {
    expect(isCaloriesVisible({ ...PROFILE }, true)).toBe(true)
    expect(isCaloriesVisible({ ...PROFILE }, false)).toBe(false)
    expect(isCaloriesVisible(null, true)).toBe(false)
    expect(isCaloriesVisible(null, false)).toBe(false)
  })
})
