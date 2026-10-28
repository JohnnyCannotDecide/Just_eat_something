import {
  ACTIVITY_LEVELS,
  BMR_FORMULA,
  CALORIE_SAFETY_FLOOR,
  GOAL_ADJUSTMENTS,
} from '@/config/gameConfig'

import type { ActivityLevel, BodyProfile, CalorieGoal, Sex } from './types'

function assertPositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label}必须是正有限数，收到: ${String(value)}`)
  }
}

function getSexOffset(sex: Sex): number {
  const entry = Object.entries(BMR_FORMULA.sexOffset).find(
    ([key]) => key === sex,
  )
  if (!entry) {
    throw new RangeError(`未知性别: ${String(sex)}`)
  }
  return entry[1]
}

function getActivityFactor(activity: ActivityLevel): number {
  const entry = ACTIVITY_LEVELS.find((item) => item.level === activity)
  if (!entry) {
    throw new RangeError(`未知活动水平: ${String(activity)}`)
  }
  return entry.factor
}

function getGoalAdjustment(goal: CalorieGoal): number {
  const entry = Object.entries(GOAL_ADJUSTMENTS).find(([key]) => key === goal)
  if (!entry) {
    throw new RangeError(`未知热量目标: ${String(goal)}`)
  }
  return entry[1]
}

function getSafetyFloor(sex: Sex): number {
  const entry = Object.entries(CALORIE_SAFETY_FLOOR).find(([key]) => key === sex)
  if (!entry) {
    throw new RangeError(`未知性别: ${String(sex)}`)
  }
  return entry[1]
}

function validateBody(profile: BodyProfile): void {
  assertPositive(profile.age, '年龄')
  assertPositive(profile.heightCm, '身高')
  assertPositive(profile.weightKg, '体重')
}

/** Mifflin-St Jeor 基础代谢，未取整。 */
export function calcBmr(profile: BodyProfile): number {
  validateBody(profile)
  const offset = getSexOffset(profile.sex)

  return (
    BMR_FORMULA.weightKgFactor * profile.weightKg +
    BMR_FORMULA.heightCmFactor * profile.heightCm -
    BMR_FORMULA.ageFactor * profile.age +
    offset
  )
}

/**
 * 每日目标热量 = BMR × 活动系数 × (1 + 目标调整)，再套用性别安全下限。
 * manualTargetKcal 是显式手动覆盖：有效时原样取整返回，不再套公式和下限。
 */
export function calcTargetCalories(profile: BodyProfile): number {
  const manual = profile.manualTargetKcal
  if (typeof manual === 'number') {
    assertPositive(manual, '手动目标热量')
    return Math.round(manual)
  }

  const bmr = calcBmr(profile)
  const activityFactor = getActivityFactor(profile.activity)
  const goalAdjustment = getGoalAdjustment(profile.goal)
  const raw = bmr * activityFactor * (1 + goalAdjustment)

  return Math.max(Math.round(raw), getSafetyFloor(profile.sex))
}
