import { beforeEach, describe, expect, it } from 'vitest'

import { clearTestStorage } from '@/test/storage'

import { CloudSyncAdapter } from './CloudSyncAdapter'
import { LocalStorageAdapter } from './LocalStorageAdapter'
import { TEST_STORAGE_PREFIX } from './namespaces'

beforeEach(() => {
  clearTestStorage()
})

describe('LocalStorageAdapter', () => {
  it('sets and gets JSON values', async () => {
    const storage = new LocalStorageAdapter(TEST_STORAGE_PREFIX)
    await storage.set('state', { count: 2 })

    await expect(storage.get<{ count: number }>('state')).resolves.toEqual({ count: 2 })
  })

  it('returns null for missing keys', async () => {
    const storage = new LocalStorageAdapter(TEST_STORAGE_PREFIX)
    await expect(storage.get('missing')).resolves.toBeNull()
  })

  it('removes keys', async () => {
    const storage = new LocalStorageAdapter(TEST_STORAGE_PREFIX)
    await storage.set('state', 1)
    await storage.remove('state')

    await expect(storage.get('state')).resolves.toBeNull()
  })

  it('exports only prefixed keys without the prefix', async () => {
    const storage = new LocalStorageAdapter(TEST_STORAGE_PREFIX)
    await storage.set('a', 1)
    await storage.set('b', { ok: true })
    localStorage.setItem('other', '"ignored"')
    localStorage.setItem('other:app-data', '{"ignored":true}')

    await expect(storage.exportAll()).resolves.toEqual({ a: 1, b: { ok: true } })
    expect(localStorage.getItem('other:app-data')).toBe('{"ignored":true}')
    localStorage.removeItem('other:app-data')
  })

  it('returns null for corrupt JSON', async () => {
    const storage = new LocalStorageAdapter(TEST_STORAGE_PREFIX)
    localStorage.setItem(`${TEST_STORAGE_PREFIX}broken`, '{not json')

    await expect(storage.get('broken')).resolves.toBeNull()
  })

  it('returns the raw string untouched, even when it is corrupt', async () => {
    const storage = new LocalStorageAdapter(TEST_STORAGE_PREFIX)
    localStorage.setItem(`${TEST_STORAGE_PREFIX}broken`, '{not json')

    await expect(storage.getRaw('broken')).resolves.toBe('{not json')
  })

  it('writes raw strings without JSON encoding', async () => {
    const storage = new LocalStorageAdapter(TEST_STORAGE_PREFIX)
    await storage.setRaw('raw', '{"schemaVersion":2}')

    expect(localStorage.getItem(`${TEST_STORAGE_PREFIX}raw`)).toBe(
      '{"schemaVersion":2}',
    )
    await expect(storage.get('raw')).resolves.toEqual({ schemaVersion: 2 })
  })

  it('skips corrupt values while exporting', async () => {
    const storage = new LocalStorageAdapter(TEST_STORAGE_PREFIX)
    localStorage.setItem(`${TEST_STORAGE_PREFIX}broken`, '{not json')
    await storage.set('good', 1)

    await expect(storage.exportAll()).resolves.toEqual({ good: 1 })
  })
})

describe('CloudSyncAdapter', () => {
  it('is an explicit not-implemented stub', async () => {
    const cloud = new CloudSyncAdapter()

    await expect(cloud.get('x')).rejects.toThrow('尚未实现')
    await expect(cloud.set('x', 1)).rejects.toThrow('尚未实现')
    await expect(cloud.getRaw('x')).rejects.toThrow('尚未实现')
    await expect(cloud.setRaw('x', 'raw')).rejects.toThrow('尚未实现')
    await expect(cloud.remove('x')).rejects.toThrow('尚未实现')
    await expect(cloud.exportAll()).rejects.toThrow('尚未实现')
  })
})
