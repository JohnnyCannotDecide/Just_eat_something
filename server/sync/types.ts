import type { SyncCollection } from '../../src/core/sync/protocol'

export interface SyncEnv {
  DB: D1Database
}

export interface AuthenticatedUser {
  userHash: string
  rev: number
}

/** 已通过校验、时间戳已钳制的记录变更。 */
export interface ValidatedChange {
  collection: SyncCollection
  id: string
  key: string
  json: string
  updatedAt: number
  deleted: boolean
}

export interface RecordRow {
  collection: string
  id: string
  json: string
  updated_at: number
  device_id: string
  deleted: number
  rev: number
}

export interface ImageRow {
  id: string
  mime: string
  data: string
  updated_at: number
  deleted: number
  rev: number
}

export interface ImageMetaRow {
  id: string
  mime: string
  updated_at: number
  deleted: number
  rev: number
}
