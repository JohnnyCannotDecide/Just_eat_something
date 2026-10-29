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
import { buildImageStatements } from '../../../server/sync/records'
import { allocateRev } from '../../../server/sync/rev'
import { captureDailySnapshot } from '../../../server/sync/snapshots'
import type { SyncEnv } from '../../../server/sync/types'
import { validateImages } from '../../../server/sync/validate'

/** 图片上传：单张解码后 ≤256 KB，一次 ≤10 张；同 id 按 updatedAt 覆盖。 */
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
    const images = validateImages(body.images, now)

    if (images.length === 0) {
      return jsonResponse({ rev: user.rev })
    }

    await captureDailySnapshot(context.env.DB, user.userHash, now)
    const rev = await allocateRev(context.env.DB, user.userHash, now)

    await context.env.DB.batch(
      buildImageStatements(context.env.DB, user.userHash, rev, images),
    )

    return jsonResponse({ rev })
  } catch (error) {
    return errorResponse(error)
  }
}
