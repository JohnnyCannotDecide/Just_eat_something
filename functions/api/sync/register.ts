import { SYNC } from '../../../src/config/gameConfig'
import { isValidCodeHash } from '../../../src/core/sync/protocol'
import {
  ApiError,
  clientIp,
  errorResponse,
  jsonResponse,
  preflight,
  readJsonObject,
} from '../../../server/sync/http'
import { consumeRateLimit } from '../../../server/sync/rateLimit'
import type { SyncEnv } from '../../../server/sync/types'

/**
 * 注册只接收同步码的 SHA-256，服务端永远拿不到明文码。
 * 幂等：同一哈希重复注册返回 200；宽限期内仍可鉴权的旧码也视为已存在。
 */
export const onRequest: PagesFunction<SyncEnv> = async (context) => {
  const early = preflight(context.request)
  if (early) {
    return early
  }

  try {
    const now = Date.now()
    const ip = clientIp(context.request)
    if (
      !consumeRateLimit(
        `register:${ip}`,
        SYNC.registerRateLimitPerMinute,
        now,
      )
    ) {
      throw new ApiError(429, 'rate-limited')
    }

    const body = await readJsonObject(context.request)
    if (!isValidCodeHash(body.codeHash)) {
      throw new ApiError(400, 'bad-request')
    }
    const codeHash = body.codeHash

    const existing = await context.env.DB.prepare(
      `SELECT 1 AS found FROM users
       WHERE code_hash = ?
          OR (prev_code_hash = ? AND prev_expires_at > ?)
       LIMIT 1`,
    )
      .bind(codeHash, codeHash, now)
      .first<{ found: number }>()

    if (existing) {
      return jsonResponse({ ok: true }, 200)
    }

    const result = await context.env.DB.prepare(
      `INSERT INTO users
         (user_hash, code_hash, prev_code_hash, prev_expires_at,
          rev, created_at, last_seen_at)
       VALUES (?, ?, NULL, NULL, 0, ?, ?)
       ON CONFLICT(user_hash) DO NOTHING`,
    )
      .bind(codeHash, codeHash, now, now)
      .run()

    const created = (result.meta?.changes ?? 0) > 0
    return jsonResponse({ ok: true }, created ? 201 : 200)
  } catch (error) {
    return errorResponse(error)
  }
}
