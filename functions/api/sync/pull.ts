import { SYNC } from '../../../src/config/gameConfig'
import { makeRecordKey } from '../../../src/core/sync/protocol'
import type { SyncCollection } from '../../../src/core/sync/protocol'
import { authenticate } from '../../../server/sync/auth'
import {
  ApiError,
  errorResponse,
  jsonResponse,
  preflight,
  readJsonObject,
} from '../../../server/sync/http'
import { consumeRateLimit } from '../../../server/sync/rateLimit'
import { pullImageMetadata, pullRecords } from '../../../server/sync/records'
import type { SyncEnv } from '../../../server/sync/types'

function readCursor(value: unknown): number | null {
  if (value === undefined || value === null) {
    return 0
  }
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    return null
  }
  return value
}

/**
 * records 与 images 是两条独立游标；每页只返回完整的 rev 块，
 * 客户端凭 nextRev 继续翻页，不会跳过同一 rev 中未返回的行。
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
    const recordRev = readCursor(body.recordRev)
    const imageRev = readCursor(body.imageRev)
    if (recordRev === null || imageRev === null) {
      throw new ApiError(400, 'bad-request')
    }

    const recordsPage = await pullRecords(
      context.env.DB,
      user.userHash,
      recordRev,
    )
    const imagesPage = await pullImageMetadata(
      context.env.DB,
      user.userHash,
      imageRev,
    )

    return jsonResponse({
      records: recordsPage.rows.map((row) => ({
        key: makeRecordKey(row.collection as SyncCollection, row.id),
        collection: row.collection,
        id: row.id,
        json: row.json,
        updatedAt: row.updated_at,
        deviceId: row.device_id,
        deleted: row.deleted === 1,
        rev: row.rev,
      })),
      images: imagesPage.rows.map((row) => ({
        id: row.id,
        mime: row.mime,
        updatedAt: row.updated_at,
        deleted: row.deleted === 1,
        rev: row.rev,
      })),
      recordRev: recordsPage.nextRev,
      imageRev: imagesPage.nextRev,
      hasMoreRecords: recordsPage.hasMore,
      hasMoreImages: imagesPage.hasMore,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
