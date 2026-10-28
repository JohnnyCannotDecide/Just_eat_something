import type { DrawSource, DrawAllowance } from '@/core/drawBudget'
import type { DrawBlockedReason } from '@/core/gameFlow'
import type { ActivityLevel, Sex } from '@/core/types'

import type { TodayMealStatus } from './selectors/todayView'

export const MEDICAL_DISCLAIMER = '仅供参考，不构成医疗建议。'

export const STATUS_LABELS: Record<TodayMealStatus, string> = {
  undrawn: '未抽',
  drawn: '已抽',
  checkedIn: '已打卡',
}

export const SEX_LABELS: Record<Sex, string> = {
  female: '女生',
  male: '男生',
}

export const ACTIVITY_HINTS: Record<ActivityLevel, string> = {
  sedentary: '大部分时间坐着，偶尔散步',
  light: '每周轻松动一动 1–3 次',
  moderate: '每周认真运动 3–5 次',
  active: '经常运动，或工作本身很费体力',
  veryActive: '每天高强度运动，或重体力工作',
}

export const DRAW_SOURCE_LABELS: Record<DrawSource, string> = {
  base: '基础次数',
  token: '抽卡券',
  ad: '广告奖励',
}

export const DRAW_BLOCKED_MESSAGES: Record<DrawBlockedReason, string> = {
  'checked-in': '这餐已经收工啦',
  'no-draws': '这餐的次数用完啦',
  'pool-exhausted': '本餐的套餐已经抽完啦',
}

export const REDRAW_NO_CANDIDATE_MESSAGES = {
  'empty-pool': '这个分类暂时没有可替换的菜',
  'pity-unavailable': '保底候选里暂时没有可替换的 SR+ 菜品',
} as const

export function stampUpgradeMessage(tierLabel: string): string {
  return `升级成${tierLabel}章啦`
}

export function stampUpgradePath(
  previousLabel: string,
  tierLabel: string,
): string {
  return `${previousLabel}章 → ${tierLabel}章`
}

export function stampNextTierMessage(
  remaining: number,
  tierLabel: string,
): string {
  return `再打卡 ${remaining} 次，升级为${tierLabel}章`
}

export function stampFirstTierMessage(
  remaining: number,
  tierLabel: string,
): string {
  return `打卡 ${remaining} 次，就能得到${tierLabel}章`
}

export function stampBookCardLabel(input: {
  name: string
  collected: boolean
  tierLabel: string | null
  count: number
}): string {
  if (!input.collected) {
    return `${input.name}，尚未收集，查看详情`
  }
  return `${input.name}，${input.tierLabel}章，累计打卡 ${input.count} 次，查看详情`
}

/** 按钮文案完全跟随 core 给出的下一次来源。 */
export function drawActionLabel(allowance: DrawAllowance): string {
  if (!allowance.canDraw) {
    return '这餐的次数用完了'
  }
  switch (allowance.nextSource) {
    case 'base':
      return '抽一张'
    case 'token':
      return '用抽卡券抽'
    case 'ad':
      return '看广告再抽'
    default:
      return '抽一张'
  }
}
