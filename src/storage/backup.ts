import {
  BACKUP_MAX_BYTES,
  IMAGE_MAX_BYTES,
  IMAGES_MAX_COUNT,
  IMAGES_TOTAL_MAX_BYTES,
} from '@/config/storageLimits'
import { toDateKey } from '@/core/dateKey'

import type { ImageMime, StoredImage } from './BinaryStorageAdapter'
import { isImageMime } from './BinaryStorageAdapter'
import { normalizeAppData } from './appData'
import type { AppData } from './appData'

export const BACKUP_FORMAT = 'diet-diary-backup'
export const BACKUP_VERSION = 1

/** 导入过程中留下这个标记；hydrate 看到它会清理上次没写完的图片。 */
export const PENDING_IMPORT_KEY = 'app-data:pending-import'

export interface BackupImageEntry {
  imageId: string
  mime: ImageMime
  base64: string
}

export interface BackupBundle {
  format: typeof BACKUP_FORMAT
  version: number
  exportedAt: string
  data: AppData
  images: BackupImageEntry[]
}

export interface ParsedBackupImage extends StoredImage {
  imageId: string
}

export interface ParsedBackup {
  data: AppData
  /** 旧版纯 AppData 备份没有图片包，这里为空数组。 */
  images: ParsedBackupImage[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length
}

/**
 * 主数据里所有被引用的图片键：自制菜封面 + 全部历史部件快照。
 * 未勾选的草稿也会保留，所以一起导出。
 */
export function collectReferencedImageIds(
  data: Pick<AppData, 'customDishes' | 'days'>,
): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  const add = (id: string | null | undefined) => {
    if (!id || seen.has(id)) {
      return
    }
    seen.add(id)
    ids.push(id)
  }

  for (const dish of data.customDishes) {
    add(dish.imageId)
  }
  for (const day of Object.values(data.days)) {
    for (const meal of Object.values(day.meals)) {
      for (const candidate of meal.candidateCombos) {
        for (const component of candidate.components) {
          add(component.imageId)
        }
      }
    }
  }

  return ids
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    )
  }
  return btoa(binary)
}

const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/

function base64ToBytes(text: string): Uint8Array {
  if (
    text.length === 0 ||
    text.length % 4 !== 0 ||
    !BASE64_PATTERN.test(text)
  ) {
    throw new Error('备份中的图片数据损坏（base64 格式不正确）')
  }

  let binary: string
  try {
    binary = atob(text)
  } catch {
    throw new Error('备份中的图片数据损坏（base64 格式不正确）')
  }
  if (binary.length === 0) {
    throw new Error('备份中的图片数据损坏（内容为空）')
  }

  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

/**
 * 打包导出；被引用但已经不存在的图片直接报错，不生成缺图的备份。
 */
export function buildBackup(
  data: AppData,
  images: ReadonlyMap<string, StoredImage>,
  exportedAt: string = toDateKey(),
): BackupBundle {
  const referenced = collectReferencedImageIds(data)
  if (referenced.length > IMAGES_MAX_COUNT) {
    throw new Error('图片太多，请先清理一些自制菜')
  }

  const entries: BackupImageEntry[] = []
  let totalBytes = 0
  for (const imageId of referenced) {
    const image = images.get(imageId)
    if (!image) {
      throw new Error('有自制菜图片已经丢失，无法导出完整备份')
    }
    if (image.bytes.byteLength > IMAGE_MAX_BYTES) {
      throw new Error('有图片太大，无法导出备份')
    }
    totalBytes += image.bytes.byteLength
    if (totalBytes > IMAGES_TOTAL_MAX_BYTES) {
      throw new Error('图片太多或太大，请先清理一些自制菜')
    }
    entries.push({
      imageId,
      mime: image.mime,
      base64: bytesToBase64(image.bytes),
    })
  }

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt,
    data,
    images: entries,
  }
}

/** 序列化并检查最终体积；base64 会把图片放大约 1/3。 */
export function serializeBackup(bundle: BackupBundle): string {
  const json = JSON.stringify(bundle)
  if (utf8Bytes(json) > BACKUP_MAX_BYTES) {
    throw new Error('备份文件太大，请先清理一些自制菜')
  }
  return json
}

function parseImages(value: unknown): ParsedBackupImage[] {
  if (value === undefined) {
    return []
  }
  if (!Array.isArray(value)) {
    throw new Error('导入失败：图片列表格式不正确')
  }
  if (value.length > IMAGES_MAX_COUNT) {
    throw new Error('备份里的图片太多')
  }

  const images: ParsedBackupImage[] = []
  const seen = new Set<string>()
  let totalBytes = 0

  for (const raw of value) {
    if (!isRecord(raw)) {
      throw new Error('备份中的图片数据无效')
    }
    const imageId = typeof raw.imageId === 'string' ? raw.imageId.trim() : ''
    if (!imageId || seen.has(imageId)) {
      throw new Error('备份中的图片数据无效（缺少或重复的图片 id）')
    }
    if (!isImageMime(raw.mime)) {
      throw new Error('备份中的图片格式不受支持')
    }
    if (typeof raw.base64 !== 'string') {
      throw new Error('备份中的图片数据无效')
    }

    const bytes = base64ToBytes(raw.base64)
    if (bytes.byteLength > IMAGE_MAX_BYTES) {
      throw new Error('备份里有单张图片超过 1 MB')
    }
    totalBytes += bytes.byteLength
    if (totalBytes > IMAGES_TOTAL_MAX_BYTES) {
      throw new Error('备份里的图片总量超过上限')
    }

    seen.add(imageId)
    images.push({ imageId, mime: raw.mime, bytes })
  }

  return images
}

/**
 * 解析备份：新包装格式带图片；旧版纯 AppData 仍然可以导入（图片视为空）。
 * 图片是否齐全由调用方结合现有存储再校验。
 */
export function parseBackupJson(
  text: string,
  todayKey: string = toDateKey(),
): ParsedBackup {
  if (utf8Bytes(text) > BACKUP_MAX_BYTES) {
    throw new Error('备份文件超过大小上限')
  }

  let raw: unknown
  try {
    raw = JSON.parse(text) as unknown
  } catch {
    throw new Error('导入失败：不是合法的 JSON')
  }
  if (!isRecord(raw)) {
    throw new Error('导入失败：无法识别的备份格式')
  }

  if (raw.format === BACKUP_FORMAT) {
    const version = raw.version
    if (typeof version !== 'number' || !Number.isInteger(version)) {
      throw new Error('导入失败：备份缺少有效的版本号')
    }
    if (version > BACKUP_VERSION) {
      throw new Error(
        `备份版本 ${version} 高于当前支持的版本 ${BACKUP_VERSION}，请升级应用`,
      )
    }
    if (version !== BACKUP_VERSION) {
      throw new Error('导入失败：不支持的备份版本')
    }
    if (!isRecord(raw.data)) {
      throw new Error('导入失败：备份缺少应用数据')
    }

    return {
      data: normalizeAppData(raw.data, todayKey),
      images: parseImages(raw.images),
    }
  }

  // 旧版直接导出 AppData：顶层一定有 schemaVersion。
  if (typeof raw.schemaVersion === 'number') {
    return {
      data: normalizeAppData(raw, todayKey),
      images: [],
    }
  }

  throw new Error('导入失败：无法识别的备份格式')
}
