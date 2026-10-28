import { toDateKey } from '@/core/dateKey'

export interface ClockSnapshot {
  dateKey: string
  /** Date#getTimezoneOffset()：分钟数，东八区为 -480。 */
  timezoneOffset: number
}

export type ClockChange = 'none' | 'date' | 'timezone' | 'both'

export function readClockSnapshot(now: Date = new Date()): ClockSnapshot {
  return {
    dateKey: toDateKey(now),
    timezoneOffset: now.getTimezoneOffset(),
  }
}

/**
 * 比较两次时钟快照。
 * 日期倒退也算 date 变化：切回该本地日期对应的历史记录，不拦截。
 */
export function detectClockChange(
  previous: ClockSnapshot,
  current: ClockSnapshot,
): ClockChange {
  const dateChanged = previous.dateKey !== current.dateKey
  const timezoneChanged = previous.timezoneOffset !== current.timezoneOffset

  if (dateChanged && timezoneChanged) {
    return 'both'
  }
  if (dateChanged) {
    return 'date'
  }
  if (timezoneChanged) {
    return 'timezone'
  }
  return 'none'
}
