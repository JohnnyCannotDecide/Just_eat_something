import { DRAW_LIMITS, TOKEN_REWARDS } from '@/config/gameConfig'

import { toDateKey } from './dateKey'

export type TokenRewardKind = 'formal' | 'custom'

export interface TokenWallet {
  /** 抽卡券所属的本地日期键。 */
  dateKey: string
  count: number
  /** 当天的自定义记录奖励是否已经领取。 */
  customRewardClaimed: boolean
}

const MS_PER_DAY = 24 * 60 * 60 * 1000
const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

/** 将 YYYY-MM-DD 转为 UTC 日序号；非法日期返回 null。 */
function toDayNumber(dateKey: string): number | null {
  const match = DATE_KEY_PATTERN.exec(dateKey)
  if (!match) {
    return null
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const time = Date.UTC(year, month - 1, day)
  const date = new Date(time)

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }

  return time / MS_PER_DAY
}

export function createTokenWallet(todayKey: string = toDateKey()): TokenWallet {
  return {
    dateKey: todayKey,
    count: 0,
    customRewardClaimed: false,
  }
}

export function isTokenValid(
  wallet: TokenWallet,
  todayKey: string = toDateKey(),
): boolean {
  const issued = toDayNumber(wallet.dateKey)
  const today = toDayNumber(todayKey)
  if (issued === null || today === null) {
    return false
  }

  const age = today - issued
  return age >= 0 && age < DRAW_LIMITS.tokenValidDays
}

export function normalizeTokenWallet(
  wallet: TokenWallet | null | undefined,
  todayKey: string = toDateKey(),
): TokenWallet {
  if (!wallet || !isTokenValid(wallet, todayKey)) {
    return createTokenWallet(todayKey)
  }

  return {
    dateKey: wallet.dateKey,
    count: Number.isFinite(wallet.count)
      ? Math.max(0, Math.floor(wallet.count))
      : 0,
    customRewardClaimed: Boolean(wallet.customRewardClaimed),
  }
}

export function grantCheckInToken(
  wallet: TokenWallet,
  kind: TokenRewardKind,
  todayKey: string = toDateKey(),
): { wallet: TokenWallet; rewarded: boolean } {
  const current = normalizeTokenWallet(wallet, todayKey)

  if (kind === 'formal') {
    const reward = TOKEN_REWARDS.formalDish
    return {
      wallet: { ...current, count: current.count + reward },
      rewarded: reward > 0,
    }
  }

  if (kind === 'custom') {
    if (current.customRewardClaimed) {
      return { wallet: current, rewarded: false }
    }

    const reward = TOKEN_REWARDS.customRecordFirstPerDay
    return {
      wallet: {
        ...current,
        count: current.count + reward,
        customRewardClaimed: true,
      },
      rewarded: reward > 0,
    }
  }

  throw new Error(`未知的抽卡券奖励类型: ${String(kind)}`)
}
