import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  isValidMonthKey,
  monthKeyOf,
  parseDateKey,
  shiftDateKey,
  shiftMonthKey,
  toDateKey,
} from './dateKey'

describe('toDateKey', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('pads month and day', () => {
    expect(toDateKey(new Date(2026, 2, 5))).toBe('2026-03-05')
  })

  it('handles leap day and year end', () => {
    expect(toDateKey(new Date(2024, 1, 29))).toBe('2024-02-29')
    expect(toDateKey(new Date(2026, 11, 31))).toBe('2026-12-31')
  })

  it('uses local time instead of UTC', () => {
    // UTC+ 时区里，toISOString() 会把凌晨 00:30 算成前一天。
    expect(toDateKey(new Date(2026, 0, 1, 0, 30))).toBe('2026-01-01')
  })

  it('defaults to today', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 8, 12, 0, 0))
    expect(toDateKey()).toBe('2026-07-08')
  })
})

describe('parseDateKey', () => {
  it('accepts real dates and rejects impossible ones', () => {
    expect(parseDateKey('2026-10-29')).toEqual({
      year: 2026,
      month: 10,
      day: 29,
    })
    expect(parseDateKey('2024-02-29')).not.toBeNull()
    expect(parseDateKey('2026-02-29')).toBeNull()
    expect(parseDateKey('2026-13-01')).toBeNull()
    expect(parseDateKey('2026-00-10')).toBeNull()
    expect(parseDateKey('2026-1-01')).toBeNull()
    expect(parseDateKey('')).toBeNull()
  })
})

describe('shiftDateKey', () => {
  it('moves across month, year and leap day boundaries', () => {
    expect(shiftDateKey('2026-10-01', -1)).toBe('2026-09-30')
    expect(shiftDateKey('2026-12-31', 1)).toBe('2027-01-01')
    expect(shiftDateKey('2024-02-28', 1)).toBe('2024-02-29')
    expect(shiftDateKey('2024-02-29', 1)).toBe('2024-03-01')
    expect(shiftDateKey('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('supports zero and larger offsets', () => {
    expect(shiftDateKey('2026-10-29', 0)).toBe('2026-10-29')
    expect(shiftDateKey('2026-10-29', 45)).toBe('2026-12-13')
    expect(shiftDateKey('2026-10-29', -44)).toBe('2026-09-15')
  })

  it('returns null for invalid input', () => {
    expect(shiftDateKey('2026-02-30', 1)).toBeNull()
    expect(shiftDateKey('2026-10-29', 1.5)).toBeNull()
    expect(shiftDateKey('', 0)).toBeNull()
  })
})

describe('month keys', () => {
  it('derives and validates month keys', () => {
    expect(monthKeyOf('2026-10-29')).toBe('2026-10')
    expect(monthKeyOf('2026-02-30')).toBeNull()
    expect(isValidMonthKey('2026-10')).toBe(true)
    expect(isValidMonthKey('2026-1')).toBe(false)
    expect(isValidMonthKey('2026-13')).toBe(false)
    expect(isValidMonthKey('0000-01')).toBe(false)
  })

  it('shifts months across year boundaries', () => {
    expect(shiftMonthKey('2026-10', 1)).toBe('2026-11')
    expect(shiftMonthKey('2026-12', 1)).toBe('2027-01')
    expect(shiftMonthKey('2026-01', -1)).toBe('2025-12')
    expect(shiftMonthKey('2026-10', 0)).toBe('2026-10')
    expect(shiftMonthKey('2026-10', -12)).toBe('2025-10')
  })

  it('returns null for invalid month input', () => {
    expect(shiftMonthKey('2026-13', 1)).toBeNull()
    expect(shiftMonthKey('2026-10', 1.5)).toBeNull()
  })
})
