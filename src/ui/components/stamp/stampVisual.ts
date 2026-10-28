interface StampImageDish {
  image?: string
  stampImage?: string
}

const STAMP_TILTS = [-2.1, -1.4, -0.7, 0, 0.7, 1.4, 2.1] as const

/**
 * 已解析的上传图优先，其次印章图、菜品图；空白与重复地址会被过滤。
 * 上传图由调用方先经 useImageUrl 解析成 object URL。
 */
export function getStampImageSources(
  dish: StampImageDish,
  uploadedUrl?: string | null,
): string[] {
  const sources = [uploadedUrl, dish.stampImage, dish.image]
    .map((source) => source?.trim() ?? '')
    .filter((source) => source.length > 0)

  return Array.from(new Set(sources))
}

/** 给同一道菜一个稳定的小角度，避免每次渲染都在转。 */
export function getStampTilt(seed: string): number {
  let hash = 0
  for (const char of seed) {
    hash = (hash + char.charCodeAt(0)) % STAMP_TILTS.length
  }
  return STAMP_TILTS[hash] ?? 0
}
