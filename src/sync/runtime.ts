import type { AppStore } from '@/store/useAppStore'
import type { SyncEngine } from './engine'

/** 只依赖 store 的订阅/读取端口，便于测试注入假 store。 */
export interface SyncRuntimeStore {
  subscribe: (
    listener: (state: AppStore, previous: AppStore) => void,
  ) => () => void
  getState: () => AppStore
}

export interface SyncRuntimeOptions {
  engine: Pick<SyncEngine, 'sync'>
  store: SyncRuntimeStore
  debounceMs?: number
}

/**
 * 把引擎接到 store 上：本地保存后防抖同步、回到前台/恢复网络时立即重试。
 * 引擎保持 React-free；这里只负责触发与写回，落盘仍经 store 串行队列。
 */
export function startSyncRuntime(options: SyncRuntimeOptions): () => void {
  const { engine, store, debounceMs = 3000 } = options

  let timer: ReturnType<typeof setTimeout> | null = null
  let running = false
  let rerun = false
  let applyingRemote = false
  let disposed = false

  const clearTimer = (): void => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  const run = async (): Promise<void> => {
    if (disposed) {
      return
    }
    if (running) {
      rerun = true
      return
    }

    const state = store.getState()
    if (state.status !== 'ready') {
      return
    }

    running = true
    try {
      const result = await engine.sync(state.data, state.todayKey)
      if (disposed || !result.data) {
        return
      }
      applyingRemote = true
      try {
        await store.getState().applySyncedData(result.data)
      } finally {
        applyingRemote = false
      }
    } catch {
      // 同步失败由引擎状态展示；绝不让它影响主流程。
    } finally {
      running = false
      if (rerun && !disposed) {
        rerun = false
        void run()
      }
    }
  }

  const schedule = (): void => {
    if (disposed) {
      return
    }
    clearTimer()
    timer = setTimeout(() => {
      timer = null
      void run()
    }, debounceMs)
  }

  const runNow = (): void => {
    clearTimer()
    void run()
  }

  const unsubscribe = store.subscribe((state, previous) => {
    if (applyingRemote || state.data === previous.data) {
      return
    }
    if (state.status !== 'ready') {
      return
    }
    schedule()
  })

  const onOnline = (): void => runNow()
  const onVisibility = (): void => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      runNow()
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('online', onOnline)
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility)
  }

  // 启动后先跑一轮：把上次离线期间的 pending 推上去。
  schedule()

  return () => {
    disposed = true
    clearTimer()
    unsubscribe()
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', onOnline)
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }
}
