/**
 * 展示型热量的统一格式：
 * - 值不可用（null / NaN / Infinity）→「未填」，与开关无关；
 * - 用户关闭「显示热量」→「?」；
 * - 否则返回四舍五入后的数字字符串。
 */
export function formatKcal(
  value: number | null | undefined,
  showCalories: boolean,
): string {
  if (value == null || !Number.isFinite(value)) {
    return '未填'
  }
  if (!showCalories) {
    return '?'
  }
  return String(Math.round(value))
}

/**
 * 需要带单位的展示（每餐、套餐、日历合计等）。
 * 占位文案不追加单位，避免出现「未填 kcal」「? kcal」。
 */
export function formatKcalWithUnit(
  value: number | null | undefined,
  showCalories: boolean,
): string {
  if (value == null || !Number.isFinite(value)) {
    return '未填'
  }
  if (!showCalories) {
    return '?'
  }
  return `${Math.round(value)} kcal`
}
