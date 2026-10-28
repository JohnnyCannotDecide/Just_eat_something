import { beforeEach, describe, expect, it } from 'vitest'

import { CloudSyncAdapter } from './CloudSyncAdapter'
import { LocalStorageAdapter } from './LocalStorageAdapter'

beforeEach(() => {
  localStorage.clear()
})

describe('LocalStorageAdapter', () => {
  it('sets and gets JSON values', async () => {
    const storage = new LocalStorageAdapter('test:')
    await storage.set('state', { count: 2 })

    await expect(storage.get<{ count: number }>('state')).resolves.toEqual({ count: 2 })
  })

  it('returns null for missing keys', async () => {
    const storage = new LocalStorageAdapter('test:')
    await expect(storage.get('missing')).resolves.toBeNull()
  })

  it('removes keys', async () => {
    const storage = new LocalStorageAdapter('test:')
    await storage.set('state', 1)
    await storage.remove('state')

    await expect(storage.get('state')).resolves.toBeNull()
  })

  it('exports only prefixed keys without the prefix', async () => {
    const storage = new LocalStorageAdapter('test:')
    await storage.set('a', 1)
    await storage.set('b', { ok: true })
    localStorage.setItem('other', '"ignored"')

    await expect(storage.exportAll()).resolves.toEqual({ a: 1, b: { ok: true } })
  })

  it('returns null for corrupt JSON', async () => {
    const storage = new LocalStorageAdapter('test:')
    localStorage.setItem('test:broken', '{not json')

    await expect(storage.get('broken')).resolves.toBeNull()
  })

  it('skips corrupt values while exporting', async () => {
    const storage = new LocalStorageAdapter('test:')
    localStorage.setItem('test:broken', '{not json')
    await storage.set('good', 1)

    await expect(storage.exportAll()).resolves.toEqual({ good: 1 })
  })
})

describe('CloudSyncAdapter', () => {
  it('is an explicit not-implemented stub', async () => {
    const cloud = new CloudSyncAdapter()

    await expect(cloud.get('x')).rejects.toThrow('尚未实现')
    await expect(cloud.set('x', 1)).rejects.toThrow('尚未实现')
    await expect(cloud.remove('x')).rejects.toThrow('尚未实现')
    await expect(cloud.exportAll()).rejects.toThrow('尚未实现')
  })
})
