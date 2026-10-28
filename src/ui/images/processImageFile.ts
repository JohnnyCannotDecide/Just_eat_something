import type { ImageMime } from '@/storage/BinaryStorageAdapter'

/** 原图上限：再大就说明用户选错了文件。 */
export const IMAGE_SOURCE_MAX_BYTES = 8 * 1024 * 1024
/** 压缩后统一存成 512×512 的正方形。 */
export const IMAGE_OUTPUT_SIZE = 512
/** 压缩后单图仍超过存储上限时直接拒绝。 */
export const IMAGE_STORED_MAX_BYTES = 1024 * 1024

export interface ProcessedImage {
  bytes: Uint8Array
  mime: ImageMime
  /** 仅用于表单预览；调用方负责 revoke。 */
  previewUrl: string
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality)
  })
}

/**
 * 读取图片 → 居中裁成正方形 → 缩放到 512×512 → webp（失败退回 jpeg）。
 * 失败时抛出面向用户的中文错误。
 */
export async function processImageFile(file: File): Promise<ProcessedImage> {
  if (file.size > IMAGE_SOURCE_MAX_BYTES) {
    throw new Error('图片太大了，请选择 8 MB 以内的图片')
  }
  if (!file.type.startsWith('image/')) {
    throw new Error('请选择图片文件')
  }

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('这张图片打不开，换一张试试')
  }

  try {
    const side = Math.min(bitmap.width, bitmap.height)
    if (side <= 0) {
      throw new Error('这张图片是空的，换一张试试')
    }
    const sourceX = Math.floor((bitmap.width - side) / 2)
    const sourceY = Math.floor((bitmap.height - side) / 2)

    const canvas = document.createElement('canvas')
    canvas.width = IMAGE_OUTPUT_SIZE
    canvas.height = IMAGE_OUTPUT_SIZE
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('浏览器不支持图片处理，换一张试试')
    }
    context.drawImage(
      bitmap,
      sourceX,
      sourceY,
      side,
      side,
      0,
      0,
      IMAGE_OUTPUT_SIZE,
      IMAGE_OUTPUT_SIZE,
    )

    let blob = await canvasToBlob(canvas, 'image/webp', 0.85)
    if (!blob) {
      blob = await canvasToBlob(canvas, 'image/jpeg', 0.9)
    }
    if (!blob) {
      throw new Error('图片压缩失败，换一张试试')
    }

    const bytes = new Uint8Array(await blob.arrayBuffer())
    if (bytes.byteLength > IMAGE_STORED_MAX_BYTES) {
      throw new Error('图片压缩后仍然太大，请换一张小一点的')
    }

    return {
      bytes,
      mime: blob.type === 'image/webp' ? 'image/webp' : 'image/jpeg',
      previewUrl: URL.createObjectURL(blob),
    }
  } finally {
    bitmap.close()
  }
}
