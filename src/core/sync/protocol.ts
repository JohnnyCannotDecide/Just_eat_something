import { SYNC } from '../../config/gameConfig'

/** 与 AppData 投影一一对应的记录集合；服务端只接受这些前缀。 */
export const SYNC_COLLECTIONS = [
  'meta',
  'days',
  'customDishes',
  'customIngredients',
  'checkins',
] as const

export type SyncCollection = (typeof SYNC_COLLECTIONS)[number]

export const SYNC_IMAGE_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const

export type SyncImageMime = (typeof SYNC_IMAGE_MIMES)[number]

export const RECORD_KEY_MAX_LENGTH = 200
export const RECORD_ID_MAX_LENGTH = 160
export const IMAGE_ID_MAX_LENGTH = 160

export interface ParsedRecordKey {
  collection: SyncCollection
  id: string
}

export function isSyncCollection(value: unknown): value is SyncCollection {
  return (
    typeof value === 'string' &&
    (SYNC_COLLECTIONS as readonly string[]).includes(value)
  )
}

/**
 * 记录键格式：`<collection>/<id>`。`days` 的 id 自带日期和餐次，
 * 例如 `days/2026-10-29/lunch`，因此只在第一个斜杠处切分。
 */
export function parseRecordKey(key: unknown): ParsedRecordKey | null {
  if (typeof key !== 'string' || key.length === 0) {
    return null
  }
  if (key.length > RECORD_KEY_MAX_LENGTH) {
    return null
  }
  const slash = key.indexOf('/')
  if (slash <= 0 || slash === key.length - 1) {
    return null
  }
  const collection = key.slice(0, slash)
  const id = key.slice(slash + 1)
  if (!isSyncCollection(collection) || id.length > RECORD_ID_MAX_LENGTH) {
    return null
  }
  if (id.startsWith('/') || id.endsWith('/') || id.includes('//')) {
    return null
  }
  if (/[\u0000-\u001f\u007f]/.test(id)) {
    return null
  }
  return { collection, id }
}

export function makeRecordKey(collection: SyncCollection, id: string): string {
  return `${collection}/${id}`
}

export function isValidDeviceId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 64 &&
    /^[A-Za-z0-9._:-]+$/.test(value)
  )
}

export function isValidCodeHash(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
}

export function isValidImageId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= IMAGE_ID_MAX_LENGTH &&
    !/[\s\u0000-\u001f\u007f]/.test(value)
  )
}

export function isSyncImageMime(value: unknown): value is SyncImageMime {
  return (
    typeof value === 'string' &&
    (SYNC_IMAGE_MIMES as readonly string[]).includes(value)
  )
}

const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/

/** 合法 base64 的解码字节数；非法格式返回 null。 */
export function base64DecodedByteLength(text: unknown): number | null {
  if (typeof text !== 'string') {
    return null
  }
  if (
    text.length === 0 ||
    text.length % 4 !== 0 ||
    !BASE64_PATTERN.test(text)
  ) {
    return null
  }
  const padding = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0
  return (text.length / 4) * 3 - padding
}

export interface SyncVersion {
  updatedAt: number
  deviceId: string
}

/** LWW：时间更新者胜；时间相同按 deviceId 字典序稳定决胜。 */
export function compareSyncVersions(a: SyncVersion, b: SyncVersion): number {
  if (a.updatedAt !== b.updatedAt) {
    return a.updatedAt - b.updatedAt
  }
  if (a.deviceId === b.deviceId) {
    return 0
  }
  return a.deviceId < b.deviceId ? -1 : 1
}

/** 服务端钳制客户端时间，避免时钟超前永久压制其他设备。 */
export function clampClientTimestamp(
  value: unknown,
  now: number,
): number | null {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    return null
  }
  return Math.min(Math.floor(value), now + SYNC.maxClockSkewMs)
}

/** 记录 JSON 必须是普通对象（非数组），并且不超过单条上限。 */
export function parseRecordJsonObject(
  text: unknown,
): Record<string, unknown> | null {
  if (
    typeof text !== 'string' ||
    text.length === 0 ||
    text.length > SYNC.maxRecordJsonBytes
  ) {
    return null
  }
  let value: unknown
  try {
    value = JSON.parse(text) as unknown
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}
