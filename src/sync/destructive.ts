import type { DestructiveKind } from './types'

type Listener = (kind: DestructiveKind) => void

const listeners = new Set<Listener>()

/**
 * 破坏性写操作（清空/导入/恢复/recovery 重置）在 `set()` 之前同步广播。
 * 引擎收到后立即把 sidecar 置为 needs-confirm，下一轮同步不再猜测。
 */
export function noteDestructive(kind: DestructiveKind): void {
  for (const listener of [...listeners]) {
    try {
      listener(kind)
    } catch {
      // 通知失败绝不能影响用户的主数据写入。
    }
  }
}

export function onDestructive(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
