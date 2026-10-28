/**
 * 按用户本地时区输出 YYYY-MM-DD 日期键。
 * 刻意不用 toISOString()，避免 UTC 造成跨天错位。
 */
export function toDateKey(date: Date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export interface DateParts {
  year: number
  month: number
  day: number
}

function formatParts(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(
    2,
    '0',
  )}-${String(day).padStart(2, '0')}`
}

/** 严格解析日期键；不存在的日期（如 2 月 30 日）返回 null。 */
export function parseDateKey(dateKey: string): DateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
  if (!match) {
    return null
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12) {
    return null
  }

  // 用 UTC 做纯日期校验，避免本地时区的夏令时干扰。
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }

  return { year, month, day }
}

/** 按天偏移日期键；非法输入或越界年份返回 null。 */
export function shiftDateKey(
  dateKey: string,
  offsetDays: number,
): string | null {
  const parts = parseDateKey(dateKey)
  if (!parts || !Number.isInteger(offsetDays)) {
    return null
  }

  const date = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + offsetDays),
  )
  const year = date.getUTCFullYear()
  if (year < 1 || year > 9999) {
    return null
  }
  return formatParts(year, date.getUTCMonth() + 1, date.getUTCDate())
}

/** YYYY-MM-DD → YYYY-MM；非法日期返回 null。 */
export function monthKeyOf(dateKey: string): string | null {
  const parts = parseDateKey(dateKey)
  if (!parts) {
    return null
  }
  return formatParts(parts.year, parts.month, 1).slice(0, 7)
}

export function isValidMonthKey(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && parseDateKey(`${value}-01`) !== null
}

/** 按月偏移 YYYY-MM；非法输入或越界年份返回 null。 */
export function shiftMonthKey(
  monthKey: string,
  offset: number,
): string | null {
  if (!isValidMonthKey(monthKey) || !Number.isInteger(offset)) {
    return null
  }

  const [yearText, monthText] = monthKey.split('-')
  const date = new Date(
    Date.UTC(Number(yearText), Number(monthText) - 1 + offset, 1),
  )
  const year = date.getUTCFullYear()
  if (year < 1 || year > 9999) {
    return null
  }
  return formatParts(year, date.getUTCMonth() + 1, 1).slice(0, 7)
}
