import { STAMP_TIERS } from '@/config/gameConfig'

import type { StampTier } from './types'

export interface StampProgress {
  /** 归一化后的累计次数。 */
  count: number
  tier: StampTier | null
  nextTier: StampTier | null
  /** 距离下一等级还差多少次；满级时为 null。 */
  remaining: number | null
}

export interface StampUpgrade {
  previousTier: StampTier | null
  nextTier: StampTier | null
  /** 已有等级并且升到了更高等级。 */
  upgraded: boolean
}

function normalizeCount(count: number): number {
  return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0
}

/** 按累计打卡次数取最高印章等级；0 次或非法次数返回 null。 */
export function getStampTier(count: number): StampTier | null {
  if (!Number.isFinite(count) || count < 1) {
    return null
  }

  const normalized = Math.floor(count)
  let tier: StampTier | null = null

  for (const item of STAMP_TIERS) {
    if (normalized >= item.minCount) {
      tier = item.tier
    }
  }

  return tier
}

/** 当前等级、下一等级与还差次数，全部以 STAMP_TIERS 为准。 */
export function getStampProgress(count: number): StampProgress {
  const normalized = normalizeCount(count)
  const tier = getStampTier(normalized)
  const currentIndex = tier
    ? STAMP_TIERS.findIndex((item) => item.tier === tier)
    : -1
  const next = STAMP_TIERS[currentIndex + 1] ?? null

  return {
    count: normalized,
    tier,
    nextTier: next?.tier ?? null,
    remaining: next ? Math.max(0, next.minCount - normalized) : null,
  }
}

/** 比较打卡前后的等级；首次获得或等级不变都不算升级。 */
export function getStampUpgrade(
  previousCount: number,
  nextCount: number,
): StampUpgrade {
  const previousTier = getStampTier(previousCount)
  const nextTier = getStampTier(nextCount)
  const previousIndex = previousTier
    ? STAMP_TIERS.findIndex((item) => item.tier === previousTier)
    : -1
  const nextIndex = nextTier
    ? STAMP_TIERS.findIndex((item) => item.tier === nextTier)
    : -1

  return {
    previousTier,
    nextTier,
    upgraded: previousIndex >= 0 && nextIndex > previousIndex,
  }
}

/** 统一取印章等级的中文单字，供 UI 复用。 */
export function getStampTierLabel(tier: StampTier): string {
  return STAMP_TIERS.find((item) => item.tier === tier)?.label ?? tier
}
