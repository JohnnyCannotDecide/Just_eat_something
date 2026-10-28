import { useEffect, useState } from 'react'

export interface VisualViewportMetrics {
  /** 可视区域高度；环境不支持 visualViewport 时为 null，交给 CSS 回退。 */
  height: number | null
  /** 可视区域相对布局视口顶部的偏移（键盘弹起或页面被顶起时非 0）。 */
  offsetTop: number
}

function readMetrics(): VisualViewportMetrics {
  if (typeof window === 'undefined') {
    return { height: null, offsetTop: 0 }
  }
  const viewport = window.visualViewport
  if (!viewport) {
    return { height: null, offsetTop: 0 }
  }
  return { height: viewport.height, offsetTop: viewport.offsetTop }
}

/**
 * 跟随软键盘收缩的可视视口。底部弹层用它把遮罩限制在键盘上方，
 * 否则 fixed 定位会贴着布局视口底部、把操作按钮推到键盘后面。
 */
export function useVisualViewport(): VisualViewportMetrics {
  const [metrics, setMetrics] = useState<VisualViewportMetrics>(readMetrics)

  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) {
      return
    }

    const update = () => {
      setMetrics({ height: viewport.height, offsetTop: viewport.offsetTop })
    }

    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
    }
  }, [])

  return metrics
}
