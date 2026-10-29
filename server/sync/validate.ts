import { SYNC } from '../../src/config/gameConfig'
import {
  base64DecodedByteLength,
  clampClientTimestamp,
  isSyncImageMime,
  isValidImageId,
  parseRecordJsonObject,
  parseRecordKey,
} from '../../src/core/sync/protocol'
import type { SyncImageMime } from '../../src/core/sync/protocol'

import { ApiError } from './http'
import type { ValidatedChange } from './types'

function badRequest(): never {
  throw new ApiError(400, 'bad-request')
}

export function validateChanges(value: unknown, now: number): ValidatedChange[] {
  if (!Array.isArray(value)) {
    badRequest()
  }
  if (value.length > SYNC.maxRecordsPerPush) {
    throw new ApiError(413, 'too-large')
  }

  const changes: ValidatedChange[] = []
  const seen = new Set<string>()

  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      badRequest()
    }
    const item = raw as Record<string, unknown>
    const parsedKey = parseRecordKey(item.key)
    if (!parsedKey || seen.has(item.key as string)) {
      badRequest()
    }

    const updatedAt = clampClientTimestamp(item.updatedAt, now)
    if (updatedAt === null) {
      badRequest()
    }

    const deleted = item.deleted === true
    if (item.deleted !== undefined && typeof item.deleted !== 'boolean') {
      badRequest()
    }

    if (deleted) {
      seen.add(item.key as string)
      changes.push({
        ...parsedKey,
        key: item.key as string,
        json: 'null',
        updatedAt,
        deleted: true,
      })
      continue
    }

    const parsedJson = parseRecordJsonObject(item.json)
    if (!parsedJson) {
      badRequest()
    }
    // 打卡事件不可变，id 必须与记录键一致，避免同一事件写到多个键。
    if (parsedKey.collection === 'checkins' && parsedJson.id !== parsedKey.id) {
      badRequest()
    }

    seen.add(item.key as string)
    changes.push({
      ...parsedKey,
      key: item.key as string,
      json: item.json as string,
      updatedAt,
      deleted: false,
    })
  }

  return changes
}

export interface ValidatedImage {
  id: string
  mime: SyncImageMime
  base64: string
  updatedAt: number
}

export function validateImages(value: unknown, now: number): ValidatedImage[] {
  if (!Array.isArray(value)) {
    badRequest()
  }
  if (value.length > SYNC.maxImagesPerPush) {
    throw new ApiError(413, 'too-large')
  }

  const images: ValidatedImage[] = []
  const seen = new Set<string>()

  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      badRequest()
    }
    const item = raw as Record<string, unknown>
    if (!isValidImageId(item.id) || seen.has(item.id)) {
      badRequest()
    }

    if (!isSyncImageMime(item.mime)) {
      badRequest()
    }

    const decodedBytes = base64DecodedByteLength(item.base64)
    if (
      decodedBytes === null ||
      decodedBytes < 1 ||
      decodedBytes > SYNC.cloudImageServerMaxBytes
    ) {
      throw new ApiError(413, 'too-large')
    }

    const updatedAt =
      item.updatedAt === undefined
        ? now
        : clampClientTimestamp(item.updatedAt, now)
    if (updatedAt === null) {
      badRequest()
    }

    seen.add(item.id)
    images.push({
      id: item.id,
      mime: item.mime,
      base64: item.base64 as string,
      updatedAt,
    })
  }

  return images
}
