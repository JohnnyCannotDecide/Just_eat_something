import type { BodyProfile } from '@/core/types'

/**
 * 展示型热量的统一格式：关闭显示或值不可用时返回“?”。
 * 单位（kcal / 千卡）由调用方保留，避免出现“? kcal”之外的重复单位。
 */
export function formatKcal(
  value: number | null | undefined,
  showCalories: boolean,
): string {
  if (!showCalories || value == null || !Number.isFinite(value)) {
    return '?'
  }
  return String(Math.round(value))
}

/** 只有存在档案且用户打开开关时，热量才允许展示。 */
export function isCaloriesVisible(
  profile: BodyProfile | null,
  showCalories: boolean,
): boolean {
  return profile !== null && showCalories
}
