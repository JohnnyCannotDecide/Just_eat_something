import { SYNC } from '../../src/config/gameConfig'

/** 快照按 UTC 日期分桶，每天最多一份。 */
export function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10)
}

/**
 * 覆盖前把当前云端整份数据复制到独立快照表。
 * INSERT ... SELECT 避免把大 JSON 读进 Worker 再写回；
 * 失败会抛出，调用方必须让本次 push 失败，绝不无快照覆盖。
 */
export async function captureDailySnapshot(
  db: D1Database,
  userHash: string,
  now: number,
): Promise<void> {
  const day = utcDay(now)

  await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO snapshots
           (user_hash, day, collection, id, json, updated_at, device_id, deleted)
         SELECT user_hash, ?, collection, id, json, updated_at, device_id, deleted
         FROM records WHERE user_hash = ?`,
      )
      .bind(day, userHash),
    db
      .prepare(
        `INSERT OR IGNORE INTO snapshot_images
           (user_hash, day, id, mime, data, updated_at, deleted)
         SELECT user_hash, ?, id, mime, data, updated_at, deleted
         FROM images WHERE user_hash = ?`,
      )
      .bind(day, userHash),
    db
      .prepare(
        `DELETE FROM snapshots
         WHERE user_hash = ?
           AND day NOT IN (
             SELECT day FROM snapshots
             WHERE user_hash = ?
             GROUP BY day
             ORDER BY day DESC
             LIMIT ?
           )`,
      )
      .bind(userHash, userHash, SYNC.snapshotRetention),
    db
      .prepare(
        `DELETE FROM snapshot_images
         WHERE user_hash = ?
           AND day NOT IN (
             SELECT day FROM snapshot_images
             WHERE user_hash = ?
             GROUP BY day
             ORDER BY day DESC
             LIMIT ?
           )`,
      )
      .bind(userHash, userHash, SYNC.snapshotRetention),
  ])
}

export interface SnapshotStats {
  days: number
  rows: number
}

export async function getSnapshotStats(
  db: D1Database,
  userHash: string,
): Promise<SnapshotStats> {
  const row = await db
    .prepare(
      `SELECT COUNT(DISTINCT day) AS days, COUNT(*) AS rows
       FROM snapshots WHERE user_hash = ?`,
    )
    .bind(userHash)
    .first<SnapshotStats>()
  return row ?? { days: 0, rows: 0 }
}
