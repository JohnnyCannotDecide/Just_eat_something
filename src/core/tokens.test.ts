import { describe, expect, it } from 'vitest'

import {
  createTokenWallet,
  grantCheckInToken,
  isTokenValid,
  normalizeTokenWallet,
} from './tokens'
import type { TokenWallet } from './tokens'

const TODAY = '2026-10-28'
const YESTERDAY = '2026-10-27'
const TOMORROW = '2026-10-29'

function wallet(overrides: Partial<TokenWallet> = {}): TokenWallet {
  return { ...createTokenWallet(TODAY), ...overrides }
}

describe('token wallet', () => {
  it('rewards a custom record only once per day', () => {
    const first = grantCheckInToken(createTokenWallet(TODAY), 'custom', TODAY)

    expect(first.rewarded).toBe(true)
    expect(first.wallet.count).toBe(1)
    expect(first.wallet.customRewardClaimed).toBe(true)

    const second = grantCheckInToken(first.wallet, 'custom', TODAY)
    expect(second.rewarded).toBe(false)
    expect(second.wallet.count).toBe(1)
  })

  it('restores the custom reward on the next day', () => {
    const firstDay = grantCheckInToken(createTokenWallet(TODAY), 'custom', TODAY)
    const nextDay = grantCheckInToken(firstDay.wallet, 'custom', TOMORROW)

    expect(nextDay.rewarded).toBe(true)
    expect(nextDay.wallet.dateKey).toBe(TOMORROW)
    expect(nextDay.wallet.count).toBe(1)
    expect(nextDay.wallet.customRewardClaimed).toBe(true)
  })

  it('rewards every formal dish and keeps the custom flag intact', () => {
    const first = grantCheckInToken(createTokenWallet(TODAY), 'formal', TODAY)
    expect(first.rewarded).toBe(true)
    expect(first.wallet.count).toBe(1)
    expect(first.wallet.customRewardClaimed).toBe(false)

    const second = grantCheckInToken(first.wallet, 'formal', TODAY)
    expect(second.wallet.count).toBe(2)
    expect(second.wallet.customRewardClaimed).toBe(false)

    const custom = grantCheckInToken(second.wallet, 'custom', TODAY)
    expect(custom.rewarded).toBe(true)
    expect(custom.wallet.count).toBe(3)
  })

  it('treats only same-day tokens as valid', () => {
    expect(isTokenValid(createTokenWallet(TODAY), TODAY)).toBe(true)
    expect(isTokenValid(createTokenWallet(YESTERDAY), TODAY)).toBe(false)
    expect(isTokenValid(createTokenWallet(TOMORROW), TODAY)).toBe(false)
    expect(isTokenValid(createTokenWallet('2026-02-30'), TODAY)).toBe(false)
  })

  it('resets expired, future, or invalid wallets to a fresh wallet', () => {
    const expired: TokenWallet = {
      dateKey: YESTERDAY,
      count: 5,
      customRewardClaimed: true,
    }

    expect(normalizeTokenWallet(expired, TODAY)).toEqual(createTokenWallet(TODAY))
    expect(
      normalizeTokenWallet({ ...expired, dateKey: TOMORROW }, TODAY),
    ).toEqual(createTokenWallet(TODAY))
    expect(
      normalizeTokenWallet({ ...expired, dateKey: 'not-a-date' }, TODAY),
    ).toEqual(createTokenWallet(TODAY))
    expect(normalizeTokenWallet(null, TODAY)).toEqual(createTokenWallet(TODAY))
  })

  it('clamps corrupted token counts', () => {
    expect(normalizeTokenWallet(wallet({ count: Number.NaN }), TODAY).count).toBe(0)
    expect(normalizeTokenWallet(wallet({ count: -3 }), TODAY).count).toBe(0)
    expect(normalizeTokenWallet(wallet({ count: 2.8 }), TODAY).count).toBe(2)
  })

  it('does not carry expired tokens into a formal reward', () => {
    const result = grantCheckInToken(
      { dateKey: YESTERDAY, count: 3, customRewardClaimed: false },
      'formal',
      TODAY,
    )

    expect(result.wallet.dateKey).toBe(TODAY)
    expect(result.wallet.count).toBe(1)
  })
})
