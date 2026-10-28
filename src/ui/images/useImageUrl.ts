import { useEffect, useState } from 'react'

import { imageStorage } from '@/storage'

/**
 * 把 IndexedDB 里的图片键解析成 object URL。
 *
 * 每个组件自己创建/回收 URL：StrictMode 双执行、HMR 多实例和卸载中途
 * 都不会留下泄漏；图片键变化时旧 URL 随 effect 清理一起回收。
 * 解析中或失败都返回 null，由调用方回退到 emoji。
 */
export function useImageUrl(imageId?: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    setUrl(null)
    if (!imageId) {
      return
    }

    let cancelled = false
    let objectUrl: string | null = null

    void imageStorage
      .getImage(imageId)
      .then((image) => {
        if (cancelled || !image) {
          return
        }
        if (typeof URL.createObjectURL !== 'function') {
          return
        }
        // 复制到本 realm 的 ArrayBuffer，避免跨 realm 的视图类型不匹配。
        const bytes = new Uint8Array(image.bytes.byteLength)
        bytes.set(image.bytes)
        objectUrl = URL.createObjectURL(
          new Blob([bytes], { type: image.mime }),
        )
        setUrl(objectUrl)
      })
      .catch(() => {
        if (!cancelled) {
          setUrl(null)
        }
      })

    return () => {
      cancelled = true
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [imageId])

  return url
}
