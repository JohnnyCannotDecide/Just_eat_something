import { create } from 'zustand'

import { useAppStore } from '@/store/useAppStore'
import { syncEngine } from '@/sync/service'
import type {
  ConnectChoice,
  ConnectResult,
  SyncRunResult,
  SyncView,
} from '@/sync/types'

export interface PendingConnect {
  code: string
  reason: 'choice' | 'upload'
}

export interface SyncStore {
  view: SyncView | null
  loading: boolean
  busy: boolean
  error: string | null
  /** 连接已有云端后，等待用户选择“合并/以云端为准/上传本机”。 */
  pendingConnect: PendingConnect | null

  refresh: () => Promise<void>
  enable: () => Promise<boolean>
  connect: (input: string) => Promise<ConnectResult | null>
  choose: (kind: ConnectChoice) => Promise<SyncRunResult | null>
  syncNow: () => Promise<SyncRunResult | null>
  rotate: () => Promise<boolean>
  pause: () => Promise<void>
  forget: () => Promise<void>
  clearPendingConnect: () => void
  clearError: () => void
}

/**
 * 只镜像引擎状态与动作用户可见的部分；所有数据写入仍经
 * useAppStore 的串行队列，图片/同步码不在这里落盘。
 */
export const useSyncStore = create<SyncStore>()((set, get) => {
  async function applyResult(result: SyncRunResult): Promise<SyncRunResult> {
    if (result.data) {
      await useAppStore.getState().applySyncedData(result.data)
    }
    return result
  }

  async function refresh(): Promise<void> {
    try {
      const view = await syncEngine.getView()
      set({ view, loading: false })
    } catch {
      set({ loading: false })
    }
  }

  return {
    view: null,
    loading: true,
    busy: false,
    error: null,
    pendingConnect: null,

    refresh,

    async enable() {
      if (get().busy) {
        return false
      }
      set({ busy: true, error: null })
      try {
        const result = await syncEngine.enable()
        await refresh()
        if (result.error || !result.code) {
          set({ error: result.error ?? '开启失败，请稍后重试' })
          return false
        }
        return true
      } finally {
        set({ busy: false })
      }
    },

    async connect(input) {
      if (get().busy) {
        return null
      }
      set({ busy: true, error: null })
      try {
        const { data, todayKey } = useAppStore.getState()
        const result = await syncEngine.connect(input, data, todayKey)
        if (result.data) {
          await useAppStore.getState().applySyncedData(result.data)
        }
        if (
          (result.status === 'needs-choice' ||
            result.status === 'needs-upload') &&
          result.code
        ) {
          set({
            pendingConnect: {
              code: result.code,
              reason:
                result.status === 'needs-choice' ? 'choice' : 'upload',
            },
          })
        } else {
          set({ pendingConnect: null })
        }
        if (
          result.status !== 'idle' &&
          result.status !== 'needs-choice' &&
          result.status !== 'needs-upload' &&
          result.status !== 'disabled'
        ) {
          set({ error: result.error ?? '连接失败' })
        }
        await refresh()
        return result
      } catch {
        set({ error: '连接失败，请稍后重试' })
        return null
      } finally {
        set({ busy: false })
      }
    },

    async choose(kind) {
      if (get().busy) {
        return null
      }
      set({ busy: true, error: null })
      try {
        const { data, todayKey } = useAppStore.getState()
        const result = await applyResult(
          await syncEngine.choose(kind, data, todayKey),
        )
        // 失败时保留待选提示，用户可以直接重试同一个选择。
        if (result.status === 'idle') {
          set({ pendingConnect: null })
        } else {
          set({ error: result.error ?? '操作失败' })
        }
        await refresh()
        return result
      } finally {
        set({ busy: false })
      }
    },

    async syncNow() {
      if (get().busy) {
        return null
      }
      set({ busy: true, error: null })
      try {
        const { data, todayKey } = useAppStore.getState()
        const result = await applyResult(
          await syncEngine.sync(data, todayKey),
        )
        if (result.status !== 'idle') {
          set({ error: result.error ?? '同步失败' })
        }
        await refresh()
        return result
      } finally {
        set({ busy: false })
      }
    },

    async rotate() {
      if (get().busy) {
        return false
      }
      set({ busy: true, error: null })
      try {
        const result = await syncEngine.rotate()
        await refresh()
        if (result.error || !result.code) {
          set({ error: result.error ?? '轮换失败，旧同步码仍然有效' })
          return false
        }
        return true
      } finally {
        set({ busy: false })
      }
    },

    async pause() {
      if (get().busy) {
        return
      }
      set({ busy: true })
      try {
        await syncEngine.disable()
        await refresh()
      } finally {
        set({ busy: false })
      }
    },

    async forget() {
      if (get().busy) {
        return
      }
      set({ busy: true })
      try {
        await syncEngine.forget()
        set({ pendingConnect: null })
        await refresh()
      } finally {
        set({ busy: false })
      }
    },

    clearPendingConnect() {
      set({ pendingConnect: null })
    },

    clearError() {
      set({ error: null })
    },
  }
})
