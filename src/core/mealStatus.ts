import type { ComboCandidateSnapshot } from './types'

/** 单餐在一天中的展示状态：未抽 / 已抽未打卡 / 已打卡。 */
export type MealDayStatus = 'undrawn' | 'drawn' | 'checkedIn'

export interface MealStatusInput {
  budget: { checkedIn: boolean; baseUsed: number; adUsed: number }
  candidateCombos: readonly ComboCandidateSnapshot[]
}

export function getMealDayStatus(meal: MealStatusInput): MealDayStatus {
  if (meal.budget.checkedIn) {
    return 'checkedIn'
  }
  if (
    meal.candidateCombos.length > 0 ||
    meal.budget.baseUsed + meal.budget.adUsed > 0
  ) {
    return 'drawn'
  }
  return 'undrawn'
}
