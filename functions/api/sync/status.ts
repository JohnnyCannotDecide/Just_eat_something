import { SYNC } from '../../../src/config/gameConfig'
import { authenticate } from '../../../server/sync/auth'
import {
  ApiError,
  errorResponse,
  jsonResponse,
  preflight,
} from '../../../server/sync/http'
import { consumeRateLimit } from '../../../server/sync/rateLimit'
import { getLiveRecordStats } from '../../../server/sync/records'
import { getSnapshotStats } from '../../../server/sync/snapshots'
import type { SyncEnv } from '../../../server/sync/types'

/**
 * 连接前探路：云端是否为空、当前 rev。返回快照统计便于本地核对
 * “每日最多一份”是否生效（也用于集成测试）。
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

    const stats = await getLiveRecordStats(context.env.DB, user.userHash)
    const snapshot = await getSnapshotStats(context.env.DB, user.userHash)

    return jsonResponse({
      rev: user.rev,
      liveRecords: stats.liveRecords,
      hasData: stats.liveRecords > 0,
      lastUpdatedAt: stats.lastUpdatedAt,
      snapshotDays: snapshot.days,
      snapshotRows: snapshot.rows,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
