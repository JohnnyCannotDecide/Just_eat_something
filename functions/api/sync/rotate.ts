import { SYNC } from '../../../src/config/gameConfig'
import { isValidCodeHash } from '../../../src/core/sync/protocol'
import { authenticate } from '../../../server/sync/auth'
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
 * 轮换同步码：旧码写入宽限位（10 分钟）后换新码，user_hash 不变，
 * 记录无需迁移。新码若已被他人使用（含宽限期内的旧码）则拒绝，
 * 避免同一同步码能命中两个账户。
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
      !consumeRateLimit(`rotate:${ip}`, SYNC.registerRateLimitPerMinute, now)
    ) {
      throw new ApiError(429, 'rate-limited')
    }

    const user = await authenticate(context.request, context.env.DB, now)
    if (
      !consumeRateLimit(
        `auth:${user.userHash}`,
        SYNC.authRateLimitPerMinute,
        now,
      )
    ) {
      throw new ApiError(429, 'rate-limited')
    }

    const body = await readJsonObject(context.request)
    if (!isValidCodeHash(body.newCodeHash)) {
      throw new ApiError(400, 'bad-request')
    }
    const newCodeHash = body.newCodeHash

    const conflict = await context.env.DB.prepare(
      `SELECT 1 AS found FROM users
       WHERE user_hash != ?
         AND (code_hash = ?
              OR (prev_code_hash = ? AND prev_expires_at > ?))
       LIMIT 1`,
    )
      .bind(user.userHash, newCodeHash, newCodeHash, now)
      .first<{ found: number }>()

    if (conflict) {
      throw new ApiError(409, 'bad-request')
    }

    const result = await context.env.DB.prepare(
      `UPDATE users
       SET prev_code_hash = code_hash,
           prev_expires_at = ?,
           code_hash = ?,
           last_seen_at = ?
       WHERE user_hash = ?`,
    )
      .bind(now + SYNC.rotationGraceMs, newCodeHash, now, user.userHash)
      .run()

    if ((result.meta?.changes ?? 0) === 0) {
      throw new ApiError(401, 'unauthorized')
    }

    return jsonResponse({ ok: true })
  } catch (error) {
    return errorResponse(error)
  }
}
