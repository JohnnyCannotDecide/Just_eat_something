import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AppData } from '@/storage/appData'
import type { SyncRunResult, SyncView } from '@/sync/types'

const mocks = vi.hoisted(() => {
  const applySyncedData = vi.fn(async (_data: unknown) => {})
  return {
    applySyncedData,
    appState: {
      data: {} as unknown,
      todayKey: '2026-10-29',
      applySyncedData,
    },
    engine: {
      getView: vi.fn(),
      enable: vi.fn(),
      connect: vi.fn(),
      choose: vi.fn(),
      sync: vi.fn(),
      rotate: vi.fn(),
      disable: vi.fn(async () => {}),
      forget: vi.fn(async () => {}),
    },
  }
})

vi.mock('@/sync/service', () => ({ syncEngine: mocks.engine }))

vi.mock('@/store/useAppStore', () => ({
  useAppStore: { getState: () => mocks.appState },
}))

import { useSyncStore } from './useSyncStore'

const CODE = 'A1B2C3D4E5F6G7H8J9K MNPQRSTVWXYZ0'
const VIEW: SyncView = {
  enabled: true,
  code: CODE,
  status: 'idle',
  lastSyncedAt: 1_760_000_000_000,
  lastError: null,
  needsReconcile: null,
  deviceId: 'device-test',
}

const DATA = { schemaVersion: 6 } as unknown as AppData

function idleResult(patch: Partial<SyncRunResult> = {}): SyncRunResult {
  return {
    status: 'idle',
    data: null,
    lastSyncedAt: 1_760_000_000_000,
    error: null,
    warnings: [],
    ...patch,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.engine.getView.mockResolvedValue(VIEW)
  useSyncStore.setState({
    view: null,
    loading: true,
    busy: false,
    error: null,
    pendingConnect: null,
  })
})

describe('useSyncStore', () => {
  it('refresh 读取引擎状态', async () => {
    await useSyncStore.getState().refresh()
    expect(useSyncStore.getState().view).toEqual(VIEW)
    expect(useSyncStore.getState().loading).toBe(false)
  })

  it('refresh 失败时只结束加载，不抛错', async () => {
    mocks.engine.getView.mockRejectedValueOnce(new Error('boom'))
    await useSyncStore.getState().refresh()
    expect(useSyncStore.getState().view).toBeNull()
    expect(useSyncStore.getState().loading).toBe(false)
  })

  it('enable 成功返回 true 并刷新状态', async () => {
    mocks.engine.enable.mockResolvedValue({ code: CODE, error: null })
    await expect(useSyncStore.getState().enable()).resolves.toBe(true)
    expect(useSyncStore.getState().view).toEqual(VIEW)
    expect(useSyncStore.getState().error).toBeNull()
  })

  it('enable 失败把错误写进 store', async () => {
    mocks.engine.enable.mockResolvedValue({ code: null, error: '网络错误' })
    await expect(useSyncStore.getState().enable()).resolves.toBe(false)
    expect(useSyncStore.getState().error).toBe('网络错误')
  })

  it('connect 需要选择时记录待选同步码，不写数据', async () => {
    mocks.engine.connect.mockResolvedValue({
      status: 'needs-choice',
      data: null,
      code: CODE,
      cloudHasData: true,
      localHasData: true,
      error: null,
    })
    const result = await useSyncStore.getState().connect('  a1b2-c3d4 ')
    expect(result?.status).toBe('needs-choice')
    expect(mocks.engine.connect).toHaveBeenCalledWith(
      '  a1b2-c3d4 ',
      mocks.appState.data,
      '2026-10-29',
    )
    expect(useSyncStore.getState().pendingConnect).toEqual({
      code: CODE,
      reason: 'choice',
    })
    expect(mocks.applySyncedData).not.toHaveBeenCalled()
    expect(useSyncStore.getState().error).toBeNull()
  })

  it('connect 需要上传时记录待上传状态', async () => {
    mocks.engine.connect.mockResolvedValue({
      status: 'needs-upload',
      data: null,
      code: CODE,
      cloudHasData: false,
      localHasData: true,
      error: null,
    })
    await useSyncStore.getState().connect(CODE)
    expect(useSyncStore.getState().pendingConnect).toEqual({
      code: CODE,
      reason: 'upload',
    })
  })

  it('connect 自动恢复时应用云端数据', async () => {
    mocks.engine.connect.mockResolvedValue({
      status: 'idle',
      data: DATA,
      code: CODE,
      cloudHasData: true,
      localHasData: false,
      error: null,
    })
    await useSyncStore.getState().connect(CODE)
    expect(mocks.applySyncedData).toHaveBeenCalledWith(DATA)
    expect(useSyncStore.getState().pendingConnect).toBeNull()
  })

  it('connect 失败时记录错误，不清空已有待选状态以外的东西', async () => {
    mocks.engine.connect.mockResolvedValue({
      status: 'auth-failed',
      data: null,
      code: null,
      cloudHasData: false,
      localHasData: false,
      error: '同步码无效',
    })
    await useSyncStore.getState().connect(CODE)
    expect(useSyncStore.getState().error).toBe('同步码无效')
    expect(useSyncStore.getState().pendingConnect).toBeNull()
    expect(mocks.applySyncedData).not.toHaveBeenCalled()
  })

  it('connect 抛出异常时给出通用错误', async () => {
    mocks.engine.connect.mockRejectedValueOnce(new Error('boom'))
    await expect(
      useSyncStore.getState().connect(CODE),
    ).resolves.toBeNull()
    expect(useSyncStore.getState().error).toBe('连接失败，请稍后重试')
    expect(useSyncStore.getState().busy).toBe(false)
  })

  it('choose 应用结果数据并清掉待选', async () => {
    useSyncStore.setState({
      pendingConnect: { code: CODE, reason: 'choice' },
    })
    mocks.engine.choose.mockResolvedValue(idleResult({ data: DATA }))
    const result = await useSyncStore.getState().choose('merge')
    expect(result?.status).toBe('idle')
    expect(mocks.engine.choose).toHaveBeenCalledWith(
      'merge',
      mocks.appState.data,
      '2026-10-29',
    )
    expect(mocks.applySyncedData).toHaveBeenCalledWith(DATA)
    expect(useSyncStore.getState().pendingConnect).toBeNull()
    expect(useSyncStore.getState().error).toBeNull()
  })

  it('choose 非空闲状态保留错误提示', async () => {
    useSyncStore.setState({
      pendingConnect: { code: CODE, reason: 'choice' },
    })
    mocks.engine.choose.mockResolvedValue(
      idleResult({
        status: 'error',
        error: '云端暂时不可用',
      }),
    )
    const result = await useSyncStore.getState().choose('cloud')
    expect(result?.status).toBe('error')
    expect(useSyncStore.getState().error).toBe('云端暂时不可用')
    // 失败时保留待选提示，方便直接重试。
    expect(useSyncStore.getState().pendingConnect).toEqual({
      code: CODE,
      reason: 'choice',
    })
  })

  it('syncNow 成功不报错，失败写入错误', async () => {
    mocks.engine.sync.mockResolvedValueOnce(idleResult())
    await expect(useSyncStore.getState().syncNow()).resolves.toMatchObject({
      status: 'idle',
    })
    expect(useSyncStore.getState().error).toBeNull()

    mocks.engine.sync.mockResolvedValueOnce(
      idleResult({ status: 'offline', error: '网络不可用' }),
    )
    await useSyncStore.getState().syncNow()
    expect(useSyncStore.getState().error).toBe('网络不可用')
  })

  it('busy 时拒绝重入', async () => {
    let release: (result: SyncRunResult) => void = () => {}
    mocks.engine.sync.mockReturnValue(
      new Promise<SyncRunResult>((resolve) => {
        release = resolve
      }),
    )

    const first = useSyncStore.getState().syncNow()
    await Promise.resolve()
    expect(useSyncStore.getState().busy).toBe(true)

    await expect(useSyncStore.getState().syncNow()).resolves.toBeNull()
    expect(mocks.engine.sync).toHaveBeenCalledTimes(1)

    release(idleResult())
    await first
    expect(useSyncStore.getState().busy).toBe(false)
  })

  it('rotate 失败保留旧码并提示', async () => {
    mocks.engine.rotate.mockResolvedValue({ code: null, error: '网络错误' })
    await expect(useSyncStore.getState().rotate()).resolves.toBe(false)
    expect(useSyncStore.getState().error).toBe('网络错误')
    expect(useSyncStore.getState().view?.code).toBe(CODE)
  })

  it('rotate 成功返回 true', async () => {
    mocks.engine.rotate.mockResolvedValue({ code: 'NEWCODE', error: null })
    await expect(useSyncStore.getState().rotate()).resolves.toBe(true)
    expect(useSyncStore.getState().error).toBeNull()
  })

  it('pause 调用 disable 并刷新', async () => {
    await useSyncStore.getState().pause()
    expect(mocks.engine.disable).toHaveBeenCalledTimes(1)
    expect(mocks.engine.getView).toHaveBeenCalled()
  })

  it('forget 清空待选并刷新', async () => {
    useSyncStore.setState({
      pendingConnect: { code: CODE, reason: 'choice' },
    })
    await useSyncStore.getState().forget()
    expect(mocks.engine.forget).toHaveBeenCalledTimes(1)
    expect(useSyncStore.getState().pendingConnect).toBeNull()
  })
})
