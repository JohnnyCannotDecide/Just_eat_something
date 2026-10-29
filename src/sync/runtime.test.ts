import { afterEach, describe, expect, it, vi } from 'vitest'

import { createEmptyAppData } from '@/storage/appData'
import type { AppData } from '@/storage/appData'
import type { AppStore } from '@/store/useAppStore'
import { startSyncRuntime } from './runtime'

const TODAY = '2026-10-29'

interface FakeState {
  data: AppData
  todayKey: string
  status: string
  applySyncedData: (data: AppData) => Promise<void>
}

function createFakeStore(initial: FakeState) {
  let state = initial
  const listeners = new Set<(next: FakeState, previous: FakeState) => void>()

  const store = {
    getState: () => state,
    subscribe: (
      listener: (next: FakeState, previous: FakeState) => void,
    ) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    setData(data: AppData) {
      const previous = state
      state = { ...state, data }
      for (const listener of [...listeners]) {
        listener(state, previous)
      }
    },
  }

  return store
}

afterEach(() => {
  vi.useRealTimers()
})

describe('startSyncRuntime', () => {
  it('数据保存后防抖同步，并把远端数据写回 store', async () => {
    vi.useFakeTimers()
    const local = createEmptyAppData(TODAY)
    const remote = {
      ...local,
      pityCount: 3,
    }
    const store = createFakeStore({
      data: local,
      todayKey: TODAY,
      status: 'ready',
      applySyncedData: async (data) => {
        store.setData(data)
      },
    })

    const sync = vi.fn(async () => ({
      status: 'idle' as const,
      data: remote,
      lastSyncedAt: 1,
      error: null,
      warnings: [],
    }))

    const stop = startSyncRuntime({
      engine: { sync },
      store: store as unknown as {
        subscribe: (listener: (state: AppStore, previous: AppStore) => void) => () => void
        getState: () => AppStore
      },
      debounceMs: 100,
    })

    // 启动时先跑一轮。
    await vi.advanceTimersByTimeAsync(100)
    expect(sync).toHaveBeenCalledTimes(1)
    expect(store.getState().data.pityCount).toBe(3)

    // 应用远端数据不应再触发一次同步。
    await vi.advanceTimersByTimeAsync(200)
    expect(sync).toHaveBeenCalledTimes(1)

    stop()
  })

  it('本地编辑后按防抖窗口合并多次改动', async () => {
    vi.useFakeTimers()
    const local = createEmptyAppData(TODAY)
    const store = createFakeStore({
      data: local,
      todayKey: TODAY,
      status: 'ready',
      applySyncedData: async () => undefined,
    })
    const sync = vi.fn(async () => ({
      status: 'idle' as const,
      data: null,
      lastSyncedAt: 1,
      error: null,
      warnings: [],
    }))

    const stop = startSyncRuntime({
      engine: { sync },
      store: store as unknown as {
        subscribe: (listener: (state: AppStore, previous: AppStore) => void) => () => void
        getState: () => AppStore
      },
      debounceMs: 100,
    })

    store.setData({ ...local, pityCount: 1 })
    await vi.advanceTimersByTimeAsync(50)
    store.setData({ ...local, pityCount: 2 })
    await vi.advanceTimersByTimeAsync(99)
    expect(sync).toHaveBeenCalledTimes(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(sync).toHaveBeenCalledTimes(1)

    stop()
  })
})
