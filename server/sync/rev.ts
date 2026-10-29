import { ApiError } from './http'

/**
 * 每次写入批次原子分配一个 rev；同一批记录共享 rev，
 * pull 依靠 rev 游标只取完整块，避免截断后跳数据。
 */
export async function allocateRev(
  db: D1Database,
  userHash: string,
  now: number,
): Promise<number> {
  const row = await db
    .prepare(
      `UPDATE users
       SET rev = rev + 1, last_seen_at = ?
       WHERE user_hash = ?
       RETURNING rev`,
    )
    .bind(now, userHash)
    .first<{ rev: number }>()

  if (!row) {
    throw new ApiError(401, 'unauthorized')
  }
  return row.rev
}
