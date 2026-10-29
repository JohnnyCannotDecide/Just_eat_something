import { describe, expect, it } from 'vitest'

import { formatKcal, formatKcalWithUnit } from './formatKcal'

describe('formatKcal', () => {
  it('rounds visible numbers to whole calories', () => {
    expect(formatKcal(232, true)).toBe('232')
    expect(formatKcal(231.6, true)).toBe('232')
    expect(formatKcal(0, true)).toBe('0')
  })

  it('hides the value when the switch is off', () => {
    expect(formatKcal(232, false)).toBe('?')
  })

  it('shows 未填 for missing or invalid values regardless of the switch', () => {
    expect(formatKcal(null, true)).toBe('未填')
    expect(formatKcal(undefined, true)).toBe('未填')
    expect(formatKcal(Number.NaN, true)).toBe('未填')
    expect(formatKcal(Number.POSITIVE_INFINITY, true)).toBe('未填')
    expect(formatKcal(null, false)).toBe('未填')
    expect(formatKcal(Number.NaN, false)).toBe('未填')
  })
})

describe('formatKcalWithUnit', () => {
  it('appends the unit only for real numbers', () => {
    expect(formatKcalWithUnit(232, true)).toBe('232 kcal')
    expect(formatKcalWithUnit(231.6, true)).toBe('232 kcal')
    expect(formatKcalWithUnit(232, false)).toBe('?')
    expect(formatKcalWithUnit(null, true)).toBe('未填')
    expect(formatKcalWithUnit(null, false)).toBe('未填')
  })
})
