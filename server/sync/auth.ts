import { hashSyncCode } from '../../src/core/sync/code'

import { ApiError } from './http'
import type { AuthenticatedUser } from './types'

const BEARER_PATTERN = /^Bearer\s+(.+)$/i

interface UserRow {
  user_hash: string
  rev: number
}

/**
 * 同步码是唯一凭证：规范化为 32 位 Crockford Base32 后做 SHA-256，
 * 再匹配当前码或轮换宽限期内的旧码。任何失败都统一 401，不透露原因。
 */
export async function authenticate(
  request: Request,
  db: D1Database,
  now: number,
): Promise<AuthenticatedUser> {
  const header = request.headers.get('Authorization')
  const match = header ? BEARER_PATTERN.exec(header.trim()) : null
  if (!match) {
    throw new ApiError(401, 'unauthorized')
  }

  const codeHash = await hashSyncCode(match[1] ?? '')
  if (!codeHash) {
    throw new ApiError(401, 'unauthorized')
  }

  const row = await db
    .prepare(
      `SELECT user_hash, rev FROM users
       WHERE code_hash = ?
          OR (prev_code_hash = ? AND prev_expires_at > ?)
       LIMIT 1`,
    )
    .bind(codeHash, codeHash, now)
    .first<UserRow>()

  if (!row) {
    throw new ApiError(401, 'unauthorized')
  }

  return { userHash: row.user_hash, rev: row.rev }
}
