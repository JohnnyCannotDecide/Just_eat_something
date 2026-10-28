/**
 * 图片/二进制端口。和 StorageAdapter（JSON）并列，而不是塞进同一个接口：
 * LocalStorageAdapter 只负责 JSON，图片由 IndexedDB 实现，
 * AppStorage 把两个端口合成一个业务侧单例。
 */
export type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp'

/** 图片用 mime + 原始字节表示，避免在 IndexedDB 里直接存 Blob。 */
export interface StoredImage {
  mime: ImageMime
  bytes: Uint8Array
}

export const IMAGE_MIMES: readonly ImageMime[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
]

export function isImageMime(value: unknown): value is ImageMime {
  return (
    typeof value === 'string' &&
    (IMAGE_MIMES as readonly string[]).includes(value)
  )
}

export interface BinaryStorageAdapter {
  getImage(key: string): Promise<StoredImage | null>
  putImage(key: string, image: StoredImage): Promise<void>
  deleteImage(key: string): Promise<void>
  clearImages(): Promise<void>
}
