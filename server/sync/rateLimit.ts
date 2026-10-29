/**
 * 单 isolate 内存滑动窗口。Pages Functions 多实例时限流不共享，
 * 只作为基础防护；真正的兜底是 Cloudflare 免费额度。
 */
const buckets = new Map<string, number[]>()

const WINDOW_MS = 60_000

/** true = 放行；false = 已超限。 */
export function consumeRateLimit(
  key: string,
  limit: number,
  now: number,
): boolean {
  const windowStart = now - WINDOW_MS
  const recent = (buckets.get(key) ?? []).filter(
    (timestamp) => timestamp > windowStart,
  )

  if (recent.length >= limit) {
    buckets.set(key, recent)
    return false
  }

  recent.push(now)
  buckets.set(key, recent)
  return true
}
