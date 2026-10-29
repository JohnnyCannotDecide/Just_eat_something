import { SYNC } from '../../../src/config/gameConfig'
import { isValidDeviceId } from '../../../src/core/sync/protocol'
import { authenticate } from '../../../server/sync/auth'
import {
  ApiError,
  errorResponse,
  jsonResponse,
  preflight,
  readJsonObject,
} from '../../../server/sync/http'
import { consumeRateLimit } from '../../../server/sync/rateLimit'
import {
  buildRecordStatements,
  getLiveRecordStats,
} from '../../../server/sync/records'
import { allocateRev } from '../../../server/sync/rev'
import { captureDailySnapshot } from '../../../server/sync/snapshots'
import type { SyncEnv } from '../../../server/sync/types'
import { validateChanges } from '../../../server/sync/validate'

/**
 * 记录写入：整批共用一个新 rev；普通记录 LWW，打卡事件只插不改。
 * 覆盖前必须成功写入当天快照，快照失败则整次 push 失败。
 * 空本地保护：isEmpty=true 且云端已有数据时返回 409，绝不反向覆盖云端。
 */
export const onRequest: PagesFunction<SyncEnv> = async (context) => {
  const early = preflight(context.request)
  if (early) {
    return early
  }

  try {
    const now = Date.now()
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
    if (!isValidDeviceId(body.deviceId)) {
      throw new ApiError(400, 'bad-request')
    }
    if (body.isEmpty !== undefined && typeof body.isEmpty !== 'boolean') {
      throw new ApiError(400, 'bad-request')
    }

    const changes = validateChanges(body.changes, now)

    if (body.isEmpty === true) {
      const stats = await getLiveRecordStats(context.env.DB, user.userHash)
      if (stats.liveRecords > 0) {
        throw new ApiError(409, 'empty-local-protected')
      }
    }

    if (changes.length === 0) {
      return jsonResponse({ rev: user.rev, accepted: 0 })
    }

    await captureDailySnapshot(context.env.DB, user.userHash, now)
    const rev = await allocateRev(context.env.DB, user.userHash, now)

    const statements = buildRecordStatements(
      context.env.DB,
      user.userHash,
      rev,
      body.deviceId,
      changes,
    )
    const results = await context.env.DB.batch(statements)
    let accepted = 0
    for (const result of results) {
      accepted += result.meta.changes
    }

    return jsonResponse({ rev, accepted })
  } catch (error) {
    return errorResponse(error)
  }
}
