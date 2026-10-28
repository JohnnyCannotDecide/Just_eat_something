import { useEffect, useState } from 'react'

import { getDishImageUrl } from '../../dishEmoji'
import { useImageUrl } from '../../images/useImageUrl'

interface DishThumbProps {
  image?: string | null
  /** 自制菜上传图片的存储键；存在时优先于 image。 */
  imageId?: string | null
  emoji: string
  className?: string
}

/**
 * 菜品缩略图：emoji 永远先做底层，图片加载成功后才覆盖。
 * 上传图解析完成前/失败时保持 emoji，不出现破图，也不抛运行时错误。
 */
export function DishThumb({
  image,
  imageId,
  emoji,
  className,
}: DishThumbProps) {
  const uploaded = useImageUrl(imageId)
  const source = uploaded ?? getDishImageUrl(image)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setLoaded(false)
  }, [source])

  return (
    <span
      className={`dish-thumb${className ? ` ${className}` : ''}`}
      aria-hidden="true"
    >
      <span
        className={`dish-thumb__emoji${loaded ? ' is-covered' : ''}`}
      >
        {emoji}
      </span>
      {source && (
        <img
          className={`dish-thumb__img${loaded ? ' is-loaded' : ''}`}
          src={source}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(false)}
        />
      )}
    </span>
  )
}
