import { SYNC_STATE_VERSION } from './types'
import type { SyncSidecar, SyncState } from './types'
import { SyncStateCorruptError } from './types'
import type { StorageAdapter } from '@/storage/StorageAdapter'

export const SYNC_CODE_KEY = 'code'
export const SYNC_STATE_KEY = 'state'
export const SYNC_STATE_CORRUPT_KEY = 'state:corrupt-backup'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringMap(value: unknown): value is Record<string, unknown> {
  return isRecord(value)
}

/** 只校验引擎依赖的骨架；条目内容由引擎按需再校验。 */
function isSyncState(value: unknown): value is SyncState {
  if (!isRecord(value)) {
    return false
  }
  return (
    value.version === SYNC_STATE_VERSION &&
    typeof value.enabled === 'boolean' &&
    typeof value.deviceId === 'string' &&
    typeof value.recordRev === 'number' &&
    typeof value.imageRev === 'number' &&
    (value.lastSyncedAt === null || typeof value.lastSyncedAt === 'number') &&
    typeof value.lastStamp === 'number' &&
    typeof value.status === 'string' &&
    (value.lastError === null || typeof value.lastError === 'string') &&
    (value.needsReconcile === null ||
      typeof value.needsReconcile === 'string') &&
    isStringMap(value.baseline) &&
    isStringMap(value.pending) &&
    isStringMap(value.images) &&
    Array.isArray(value.imageWarnings)
  )
}

/**
 * 同步码与游标放在独立前缀的 localStorage 中，与 app-data 完全隔离：
 * 导出备份、快照、迁移都看不到它。
 */
export function createLocalSyncSidecar(
  adapter: StorageAdapter,
): SyncSidecar {
  return {
    async getCode() {
      const raw = await adapter.getRaw(SYNC_CODE_KEY)
      return raw && raw.length > 0 ? raw : null
    },

    async setCode(code) {
      await adapter.setRaw(SYNC_CODE_KEY, code)
    },

    async removeCode() {
      await adapter.remove(SYNC_CODE_KEY)
    },

    async getState() {
      const raw = await adapter.getRaw(SYNC_STATE_KEY)
      if (raw === null) {
        return null
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(raw) as unknown
      } catch {
        await backupCorrupt(adapter, raw)
        throw new SyncStateCorruptError(SYNC_STATE_CORRUPT_KEY)
      }

      if (!isSyncState(parsed)) {
        await backupCorrupt(adapter, raw)
        throw new SyncStateCorruptError(SYNC_STATE_CORRUPT_KEY)
      }

      return parsed
    },

    async setState(state) {
      await adapter.setRaw(SYNC_STATE_KEY, JSON.stringify(state))
    },

    async removeState() {
      await adapter.remove(SYNC_STATE_KEY)
    },
  }
}

async function backupCorrupt(
  adapter: StorageAdapter,
  raw: string,
): Promise<void> {
  try {
    await adapter.setRaw(SYNC_STATE_CORRUPT_KEY, raw)
  } catch {
    // 备份失败也不能让损坏的 state 覆盖任何主数据。
  }
  try {
    // 移走坏值，避免每次启动都卡在同一处；备份键仍保留原内容。
    await adapter.remove(SYNC_STATE_KEY)
  } catch {
    // 移除失败时下次仍会重新备份，行为一致。
  }
}
