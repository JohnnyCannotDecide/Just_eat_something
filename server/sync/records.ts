import { SYNC } from '../../src/config/gameConfig'

import type {
  ImageMetaRow,
  ImageRow,
  RecordRow,
  ValidatedChange,
} from './types'

const RECORD_UPSERT = `
INSERT INTO records
  (user_hash, collection, id, json, updated_at, device_id, deleted, rev)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(user_hash, collection, id) DO UPDATE SET
  json = excluded.json,
  updated_at = excluded.updated_at,
  device_id = excluded.device_id,
  deleted = excluded.deleted,
  rev = excluded.rev
WHERE excluded.updated_at > records.updated_at
   OR (
     excluded.updated_at = records.updated_at
     AND excluded.device_id > records.device_id
   )
`

const CHECKIN_INSERT = `
INSERT OR IGNORE INTO records
  (user_hash, collection, id, json, updated_at, device_id, deleted, rev)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`

/** 普通记录用 LWW；打卡事件只插入、永不覆盖（事件不可变）。 */
export function buildRecordStatements(
  db: D1Database,
  userHash: string,
  rev: number,
  deviceId: string,
  changes: readonly ValidatedChange[],
): D1PreparedStatement[] {
  return changes.map((change) => {
    const sql =
      change.collection === 'checkins' ? CHECKIN_INSERT : RECORD_UPSERT
    return db
      .prepare(sql)
      .bind(
        userHash,
        change.collection,
        change.id,
        change.json,
        change.updatedAt,
        deviceId,
        change.deleted ? 1 : 0,
        rev,
      )
  })
}

const IMAGE_UPSERT = `
INSERT INTO images (user_hash, id, mime, data, updated_at, deleted, rev)
VALUES (?, ?, ?, ?, ?, 0, ?)
ON CONFLICT(user_hash, id) DO UPDATE SET
  mime = excluded.mime,
  data = excluded.data,
  updated_at = excluded.updated_at,
  deleted = excluded.deleted,
  rev = excluded.rev
WHERE excluded.updated_at > images.updated_at
`

export function buildImageStatements(
  db: D1Database,
  userHash: string,
  rev: number,
  images: readonly { id: string; mime: string; base64: string; updatedAt: number }[],
): D1PreparedStatement[] {
  return images.map((image) =>
    db
      .prepare(IMAGE_UPSERT)
      .bind(
        userHash,
        image.id,
        image.mime,
        image.base64,
        image.updatedAt,
        rev,
      ),
  )
}

interface RevGroupRow {
  rev: number
  count: number
}

interface RevBlock {
  lastRev: number
  hasMore: boolean
}

/**
 * 只返回完整的 rev 块：同一 rev 的行要么整块返回，要么整块留到下一页，
 * 否则下一次游标会跳过被截断的剩余行。
 */
async function collectRevBlock(
  db: D1Database,
  table: 'records' | 'images',
  userHash: string,
  cursor: number,
  pageSize: number,
): Promise<RevBlock> {
  const groups = await db
    .prepare(
      `SELECT rev, COUNT(*) AS count FROM ${table}
       WHERE user_hash = ? AND rev > ?
       GROUP BY rev
       ORDER BY rev ASC`,
    )
    .bind(userHash, cursor)
    .all<RevGroupRow>()

  let included = 0
  let lastRev = cursor
  let hasMore = false

  for (const group of groups.results) {
    if (included > 0 && included + group.count > pageSize) {
      hasMore = true
      break
    }
    included += group.count
    lastRev = group.rev
  }

  return { lastRev, hasMore }
}

export interface PullPage<T> {
  rows: T[]
  nextRev: number
  hasMore: boolean
}

export async function pullRecords(
  db: D1Database,
  userHash: string,
  cursor: number,
): Promise<PullPage<RecordRow>> {
  const block = await collectRevBlock(
    db,
    'records',
    userHash,
    cursor,
    SYNC.pullPageSize,
  )
  if (block.lastRev === cursor) {
    return { rows: [], nextRev: cursor, hasMore: false }
  }

  const rows = await db
    .prepare(
      `SELECT collection, id, json, updated_at, device_id, deleted, rev
       FROM records
       WHERE user_hash = ? AND rev > ? AND rev <= ?
       ORDER BY rev ASC, collection ASC, id ASC`,
    )
    .bind(userHash, cursor, block.lastRev)
    .all<RecordRow>()

  return {
    rows: rows.results,
    nextRev: block.lastRev,
    hasMore: block.hasMore,
  }
}

export async function pullImageMetadata(
  db: D1Database,
  userHash: string,
  cursor: number,
): Promise<PullPage<ImageMetaRow>> {
  const block = await collectRevBlock(
    db,
    'images',
    userHash,
    cursor,
    SYNC.pullPageSize,
  )
  if (block.lastRev === cursor) {
    return { rows: [], nextRev: cursor, hasMore: false }
  }

  const rows = await db
    .prepare(
      `SELECT id, mime, updated_at, deleted, rev
       FROM images
       WHERE user_hash = ? AND rev > ? AND rev <= ?
       ORDER BY rev ASC, id ASC`,
    )
    .bind(userHash, cursor, block.lastRev)
    .all<ImageMetaRow>()

  return {
    rows: rows.results,
    nextRev: block.lastRev,
    hasMore: block.hasMore,
  }
}

export async function getImagesByIds(
  db: D1Database,
  userHash: string,
  ids: readonly string[],
): Promise<ImageRow[]> {
  if (ids.length === 0) {
    return []
  }
  const placeholders = ids.map(() => '?').join(', ')
  const rows = await db
    .prepare(
      `SELECT id, mime, data, updated_at, deleted, rev
       FROM images
       WHERE user_hash = ? AND deleted = 0 AND id IN (${placeholders})`,
    )
    .bind(userHash, ...ids)
    .all<ImageRow>()
  return rows.results
}

export interface LiveRecordStats {
  liveRecords: number
  lastUpdatedAt: number | null
}

export async function getLiveRecordStats(
  db: D1Database,
  userHash: string,
): Promise<LiveRecordStats> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS live_records, MAX(updated_at) AS last_updated_at
       FROM records WHERE user_hash = ? AND deleted = 0`,
    )
    .bind(userHash)
    .first<{ live_records: number; last_updated_at: number | null }>()

  return {
    liveRecords: row?.live_records ?? 0,
    lastUpdatedAt: row?.last_updated_at ?? null,
  }
}
