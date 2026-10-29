import { SYNC } from '../../../src/config/gameConfig'
import { isValidImageId } from '../../../src/core/sync/protocol'
import { authenticate } from '../../../server/sync/auth'
import {
  ApiError,
  errorResponse,
  jsonResponse,
  preflight,
  readJsonObject,
} from '../../../server/sync/http'
import { consumeRateLimit } from '../../../server/sync/rateLimit'
import { getImagesByIds } from '../../../server/sync/records'
import type { SyncEnv } from '../../../server/sync/types'

/** 按 id 取图；缺失或已删除的图直接跳过，不报错。 */
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
    if (!Array.isArray(body.ids)) {
      throw new ApiError(400, 'bad-request')
    }
    if (body.ids.length > SYNC.maxImagesPerGet) {
      throw new ApiError(413, 'too-large')
    }

    const uniqueIds: string[] = []
    const seen = new Set<string>()
    for (const id of body.ids) {
      if (!isValidImageId(id)) {
        throw new ApiError(400, 'bad-request')
      }
      if (!seen.has(id)) {
        seen.add(id)
        uniqueIds.push(id)
      }
    }

    const rows = await getImagesByIds(
      context.env.DB,
      user.userHash,
      uniqueIds,
    )

    return jsonResponse({
      images: rows.map((row) => ({
        id: row.id,
        mime: row.mime,
        data: row.data,
        updatedAt: row.updated_at,
        rev: row.rev,
      })),
    })
  } catch (error) {
    return errorResponse(error)
  }
}
