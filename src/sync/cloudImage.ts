import { SYNC } from '@/config/gameConfig'
import type { ImageMime, StoredImage } from '@/storage/BinaryStorageAdapter'

export interface PreparedCloudImage {
  mime: ImageMime
  base64: string
  byteLength: number
}

/** 注入点：测试用假实现，浏览器默认走 Canvas 压缩。 */
export type PrepareImage = (
  image: StoredImage,
) => Promise<PreparedCloudImage | null>

const OUTPUT_SIZES = [512, 384, 256] as const
const QUALITIES = [0.85, 0.7, 0.55, 0.4, 0.3] as const

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(index, index + chunkSize),
    )
  }
  return btoa(binary)
}

export function base64ToBytes(text: string): Uint8Array | null {
  try {
    const binary = atob(text)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }
    return bytes
  } catch {
    return null
  }
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

function drawSquare(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  size: number,
): HTMLCanvasElement | null {
  const side = Math.min(sourceWidth, sourceHeight)
  if (side <= 0) {
    return null
  }
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) {
    return null
  }
  context.drawImage(
    source,
    Math.floor((sourceWidth - side) / 2),
    Math.floor((sourceHeight - side) / 2),
    side,
    side,
    0,
    0,
    size,
    size,
  )
  return canvas
}

/**
 * 云端图片统一压到 ≤512px、目标 ≤80 KB。
 * - 原图已经在目标内 → 原样上传（不重新编码）；
 * - 否则逐级降质量、再降尺寸，仍超标则跳过（返回 null），不影响记录同步。
 */
export const prepareCloudImage: PrepareImage = async (image) => {
  if (image.bytes.byteLength <= SYNC.cloudImageMaxBytes) {
    return {
      mime: image.mime,
      base64: bytesToBase64(image.bytes),
      byteLength: image.bytes.byteLength,
    }
  }

  if (typeof createImageBitmap !== 'function') {
    return null
  }

  let bitmap: ImageBitmap
  try {
    // Uint8Array 的 buffer 类型可能是 SharedArrayBuffer，Blob 需要普通
    // ArrayBuffer，这里复制一份保证类型与运行时都正确。
    const copy = new Uint8Array(image.bytes.byteLength)
    copy.set(image.bytes)
    bitmap = await createImageBitmap(new Blob([copy.buffer], { type: image.mime }))
  } catch {
    return null
  }

  try {
    for (const size of OUTPUT_SIZES) {
      const canvas = drawSquare(bitmap, bitmap.width, bitmap.height, size)
      if (!canvas) {
        return null
      }

      for (const quality of QUALITIES) {
        let blob = await canvasToBlob(canvas, 'image/webp', quality)
        if (!blob) {
          blob = await canvasToBlob(canvas, 'image/jpeg', quality)
        }
        if (!blob) {
          continue
        }
        const bytes = new Uint8Array(await blob.arrayBuffer())
        if (bytes.byteLength <= SYNC.cloudImageMaxBytes) {
          return {
            mime: blob.type === 'image/webp' ? 'image/webp' : 'image/jpeg',
            base64: bytesToBase64(bytes),
            byteLength: bytes.byteLength,
          }
        }
      }
    }

    return null
  } finally {
    bitmap.close()
  }
}
