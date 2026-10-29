import { describe, expect, it } from 'vitest'

import { hashRecordData } from './hash'
import { mergeCloudRecords, pendingChanges } from './merge'
import type { CloudRecordInput } from './merge'
import type { CanonicalMap, CanonicalRecord } from './canonical'
import type {
  SyncBaselineEntry,
  SyncPendingEntry,
} from './types'

const KEY = 'days/2026-10-29/lunch'
const DEVICE = 'device-local'

function record(data: unknown): CanonicalRecord {
  return { collection: 'days', id: '2026-10-29/lunch', data }
}

function localMap(data: unknown): CanonicalMap {
  return new Map([[KEY, record(data)]])
}

function row(
  data: unknown,
  updatedAt: number,
  deviceId: string,
  options: { deleted?: boolean; key?: string; collection?: 'days' | 'checkins' } = {},
): CloudRecordInput {
  const key = options.key ?? KEY
  const collection = options.collection ?? 'days'
  return {
    key,
    collection,
    id: key.slice(key.indexOf('/') + 1),
    data,
    updatedAt,
    deviceId,
    deleted: options.deleted ?? false,
    rev: 1,
  }
}

function baseline(data: unknown, updatedAt: number, deviceId: string): SyncBaselineEntry {
  return {
    hash: hashRecordData(data),
    updatedAt,
    deviceId,
    rev: 1,
  }
}

function stamp() {
  let value = 10_000
  return () => {
    value += 1
    return value
  }
}

describe('mergeCloudRecords', () => {
  it('云端更新时采用云端并清掉 pending', () => {
    const localData = { calories: 400 }
    const cloudData = { calories: 500 }
    const result = mergeCloudRecords({
      local: localMap(localData),
      pending: {},
      baseline: { [KEY]: baseline(localData, 100, 'device-old') },
      cloud: [row(cloudData, 200, 'device-cloud')],
      deviceId: DEVICE,
      nextStamp: stamp(),
    })

    expect(result.records.get(KEY)?.data).toEqual(cloudData)
    expect(result.pending[KEY]).toBeUndefined()
    expect(result.baseline[KEY]?.updatedAt).toBe(200)
  })

  it('本地待推送更新时保留本地，不覆盖 pending 时间戳', () => {
    const localData = { calories: 900 }
    const pending: Record<string, SyncPendingEntry> = {
      [KEY]: { hash: hashRecordData(localData), updatedAt: 300, deleted: false },
    }
    const result = mergeCloudRecords({
      local: localMap(localData),
      pending,
      baseline: {},
      cloud: [row({ calories: 1 }, 200, 'device-cloud')],
      deviceId: DEVICE,
      nextStamp: stamp(),
    })

    expect(result.records.get(KEY)?.data).toEqual(localData)
    expect(result.pending[KEY]?.updatedAt).toBe(300)
  })

  it('时间相同按 deviceId 字典序决胜', () => {
    const localData = { calories: 400 }
    const cloudData = { calories: 500 }

    const cloudWins = mergeCloudRecords({
      local: localMap(localData),
      pending: {},
      baseline: { [KEY]: baseline(localData, 100, 'aaa') },
      cloud: [row(cloudData, 100, 'bbb')],
      deviceId: DEVICE,
      nextStamp: stamp(),
    })
    expect(cloudWins.records.get(KEY)?.data).toEqual(cloudData)

    const localWins = mergeCloudRecords({
      local: localMap(localData),
      pending: {
        [KEY]: { hash: hashRecordData(localData), updatedAt: 100, deleted: false },
      },
      baseline: {},
      cloud: [row(cloudData, 100, 'aaa')],
      deviceId: 'zzz',
      nextStamp: stamp(),
    })
    expect(localWins.records.get(KEY)?.data).toEqual(localData)
    expect(localWins.pending[KEY]).toBeDefined()
  })

  it('云端墓碑更新时删除本地', () => {
    const localData = { calories: 400 }
    const result = mergeCloudRecords({
      local: localMap(localData),
      pending: {},
      baseline: { [KEY]: baseline(localData, 100, 'device-a') },
      cloud: [row(null, 300, 'device-cloud', { deleted: true })],
      deviceId: DEVICE,
      nextStamp: stamp(),
    })

    expect(result.records.has(KEY)).toBe(false)
    expect(result.pending[KEY]).toBeUndefined()
    expect(result.baseline[KEY]).toBeUndefined()
  })

  it('本地编辑晚于墓碑时保留并排队复活', () => {
    const localData = { calories: 400 }
    const result = mergeCloudRecords({
      local: localMap(localData),
      pending: {
        [KEY]: { hash: hashRecordData(localData), updatedAt: 400, deleted: false },
      },
      baseline: {},
      cloud: [row(null, 300, 'device-cloud', { deleted: true })],
      deviceId: DEVICE,
      nextStamp: stamp(),
    })

    expect(result.records.get(KEY)?.data).toEqual(localData)
    expect(result.pending[KEY]).toEqual({
      hash: hashRecordData(localData),
      updatedAt: 400,
      deleted: false,
    })
    expect(result.baseline[KEY]).toBeUndefined()
  })

  it('没有版本信息时保留本地，绝不静默丢数据', () => {
    const localData = { calories: 400 }
    const result = mergeCloudRecords({
      local: localMap(localData),
      pending: {},
      baseline: {},
      cloud: [row({ calories: 500 }, 200, 'device-cloud')],
      deviceId: DEVICE,
      nextStamp: stamp(),
    })

    expect(result.records.get(KEY)?.data).toEqual(localData)
    expect(result.pending[KEY]).toBeDefined()
  })

  it('本地删除待推送时，拉回自己的旧版本不会复活记录', () => {
    const result = mergeCloudRecords({
      local: new Map(),
      pending: {
        [KEY]: { hash: 'old', updatedAt: 500, deleted: true },
      },
      baseline: {},
      cloud: [row({ calories: 400 }, 400, 'device-test')],
      deviceId: DEVICE,
      nextStamp: stamp(),
    })

    expect(result.records.has(KEY)).toBe(false)
    expect(result.pending[KEY]?.deleted).toBe(true)
  })

  it('云端在本地删除之后又更新时允许复活', () => {
    const result = mergeCloudRecords({
      local: new Map(),
      pending: {
        [KEY]: { hash: 'old', updatedAt: 500, deleted: true },
      },
      baseline: {},
      cloud: [row({ calories: 400 }, 600, 'device-cloud')],
      deviceId: DEVICE,
      nextStamp: stamp(),
    })

    expect(result.records.get(KEY)?.data).toEqual({ calories: 400 })
    expect(result.pending[KEY]).toBeUndefined()
  })

  it('增量 pull 未返回的键不会被当作云端删除', () => {
    const localData = { calories: 400 }
    const pending: Record<string, SyncPendingEntry> = {
      [KEY]: { hash: hashRecordData(localData), updatedAt: 500, deleted: false },
    }
    const result = mergeCloudRecords({
      local: localMap(localData),
      pending,
      baseline: {},
      cloud: [],
      deviceId: DEVICE,
      nextStamp: stamp(),
    })
    expect(result.pending[KEY]?.updatedAt).toBe(500)
  })

  it('打卡事件取并集，冲突时保留云端并记 warning', () => {
    const key = 'checkins/event-1'
    const local: CanonicalMap = new Map([
      [key, { collection: 'checkins', id: 'event-1', data: { id: 'event-1', dishId: 'a', dateKey: '2026-10-29', createdAt: 1 } }],
    ])
    const result = mergeCloudRecords({
      local,
      pending: {},
      baseline: {},
      cloud: [
        row(
          { id: 'event-1', dishId: 'b', dateKey: '2026-10-29', createdAt: 1 },
          100,
          'device-cloud',
          { key, collection: 'checkins' },
        ),
        row(
          { id: 'event-2', dishId: 'c', dateKey: '2026-10-29', createdAt: 2 },
          100,
          'device-cloud',
          { key: 'checkins/event-2', collection: 'checkins' },
        ),
      ],
      deviceId: DEVICE,
      nextStamp: stamp(),
    })

    expect(result.records.get(key)?.data).toMatchObject({ dishId: 'b' })
    expect(result.records.has('checkins/event-2')).toBe(true)
    expect(result.warnings).toHaveLength(1)
    expect(result.pending[key]).toBeUndefined()
  })

  it('云端事件墓碑被忽略，本地事件不删除', () => {
    const key = 'checkins/event-1'
    const event = { id: 'event-1', dishId: 'a', dateKey: '2026-10-29', createdAt: 1 }
    const result = mergeCloudRecords({
      local: new Map([[key, { collection: 'checkins', id: 'event-1', data: event }]]),
      pending: {},
      baseline: {},
      cloud: [
        row(null, 100, 'device-cloud', { key, collection: 'checkins', deleted: true }),
      ],
      deviceId: DEVICE,
      nextStamp: stamp(),
    })
    expect(result.records.get(key)?.data).toEqual(event)
  })
})

describe('pendingChanges', () => {
  it('正常记录生成推送，打卡事件墓碑被丢弃', () => {
    const records = localMap({ calories: 400 })
    const result = pendingChanges(
      {
        [KEY]: { hash: hashRecordData({ calories: 400 }), updatedAt: 10, deleted: false },
        'checkins/event-1': { hash: '', updatedAt: 10, deleted: true },
        'days/2026-10-29/dinner': {
          hash: '',
          updatedAt: 10,
          deleted: false,
        },
      },
      records,
    )

    expect(result.changes).toEqual([
      {
        key: KEY,
        json: JSON.stringify({ calories: 400 }),
        updatedAt: 10,
        deleted: false,
      },
    ])
    expect(result.dropped).toEqual([
      'checkins/event-1',
      'days/2026-10-29/dinner',
    ])
  })

  it('普通记录墓碑照常推送', () => {
    const result = pendingChanges(
      { [KEY]: { hash: '', updatedAt: 10, deleted: true } },
      new Map(),
    )
    expect(result.changes).toEqual([
      { key: KEY, updatedAt: 10, deleted: true },
    ])
  })
})
