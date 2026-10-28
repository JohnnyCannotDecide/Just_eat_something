import { describe, expect, it } from 'vitest'

import {
  getStampProgress,
  getStampTier,
  getStampTierLabel,
  getStampUpgrade,
} from './stamps'

describe('getStampTier', () => {
  it('returns null before the first check-in', () => {
    expect(getStampTier(0)).toBeNull()
    expect(getStampTier(-1)).toBeNull()
    expect(getStampTier(Number.NaN)).toBeNull()
    expect(getStampTier(Number.POSITIVE_INFINITY)).toBeNull()
  })

  it('returns bronze from 1 and silver from 3', () => {
    expect(getStampTier(1)).toBe('bronze')
    expect(getStampTier(2)).toBe('bronze')
    expect(getStampTier(2.9)).toBe('bronze')
    expect(getStampTier(3)).toBe('silver')
    expect(getStampTier(6)).toBe('silver')
  })

  it('returns gold from 7', () => {
    expect(getStampTier(7)).toBe('gold')
    expect(getStampTier(100)).toBe('gold')
  })
})

describe('getStampProgress', () => {
  it('points at bronze before the first check-in', () => {
    expect(getStampProgress(0)).toEqual({
      count: 0,
      tier: null,
      nextTier: 'bronze',
      remaining: 1,
    })
  })

  it('tracks the remaining count inside each tier', () => {
    expect(getStampProgress(1)).toMatchObject({
      tier: 'bronze',
      nextTier: 'silver',
      remaining: 2,
    })
    expect(getStampProgress(2)).toMatchObject({
      tier: 'bronze',
      nextTier: 'silver',
      remaining: 1,
    })
    expect(getStampProgress(3)).toMatchObject({
      tier: 'silver',
      nextTier: 'gold',
      remaining: 4,
    })
    expect(getStampProgress(6)).toMatchObject({
      tier: 'silver',
      nextTier: 'gold',
      remaining: 1,
    })
  })

  it('normalizes fractional and invalid counts', () => {
    expect(getStampProgress(2.9)).toMatchObject({
      count: 2,
      tier: 'bronze',
      remaining: 1,
    })
    expect(getStampProgress(-1)).toMatchObject({
      count: 0,
      tier: null,
      nextTier: 'bronze',
      remaining: 1,
    })
    expect(getStampProgress(Number.NaN)).toMatchObject({
      count: 0,
      tier: null,
      nextTier: 'bronze',
      remaining: 1,
    })
    expect(getStampProgress(Number.POSITIVE_INFINITY)).toMatchObject({
      count: 0,
      tier: null,
    })
  })

  it('stops at gold', () => {
    expect(getStampProgress(7)).toEqual({
      count: 7,
      tier: 'gold',
      nextTier: null,
      remaining: null,
    })
    expect(getStampProgress(100)).toEqual({
      count: 100,
      tier: 'gold',
      nextTier: null,
      remaining: null,
    })
  })
})

describe('getStampUpgrade', () => {
  it('does not count the first bronze as an upgrade', () => {
    expect(getStampUpgrade(0, 1)).toEqual({
      previousTier: null,
      nextTier: 'bronze',
      upgraded: false,
    })
  })

  it('detects silver at 3 and gold at 7', () => {
    expect(getStampUpgrade(2, 3)).toEqual({
      previousTier: 'bronze',
      nextTier: 'silver',
      upgraded: true,
    })
    expect(getStampUpgrade(6, 7)).toEqual({
      previousTier: 'silver',
      nextTier: 'gold',
      upgraded: true,
    })
  })

  it('does not report an upgrade when the tier is unchanged', () => {
    expect(getStampUpgrade(1, 2).upgraded).toBe(false)
    expect(getStampUpgrade(3, 6).upgraded).toBe(false)
    expect(getStampUpgrade(7, 8).upgraded).toBe(false)
    expect(getStampUpgrade(0, 0).upgraded).toBe(false)
  })

  it('handles invalid counts without throwing', () => {
    expect(getStampUpgrade(Number.NaN, 1)).toEqual({
      previousTier: null,
      nextTier: 'bronze',
      upgraded: false,
    })
    expect(getStampUpgrade(1, Number.POSITIVE_INFINITY)).toEqual({
      previousTier: 'bronze',
      nextTier: null,
      upgraded: false,
    })
  })
})

describe('getStampTierLabel', () => {
  it('returns the configured label', () => {
    expect(getStampTierLabel('bronze')).toBe('铜')
    expect(getStampTierLabel('silver')).toBe('银')
    expect(getStampTierLabel('gold')).toBe('金')
  })
})
