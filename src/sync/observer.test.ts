import { describe, expect, it } from 'vitest'

import type { CanonicalMap } from './canonical'
import { hashRecordData } from './hash'
import { updatePendingChanges } from './observer'
import type { SyncBaselineEntry } from './types'

const KEY = 'days/2026-10-29/lunch'

function records(data: unknown): CanonicalMap {
  return new Map([
    [KEY, { collection: 'days', id: '2026-10-29/lunch', data }],
  ])
}

function baseline(data: unknown): SyncBaselineEntry {
  return { hash: hashRecordData(data), updatedAt: 100, deviceId: 'd', rev: 1 }
}

function counter(start = 1000) {
  let value = start
  return () => {
    value += 1
    return value
  }
}

describe('updatePendingChanges', () => {
  it('与 baseline 内容一致时不产生 pending', () => {
    const data = { calories: 400 }
    const result = updatePendingChanges({
      records: records(data),
      baseline: { [KEY]: baseline(data) },
      pending: {},
      nextStamp: counter(),
    })
    expect(result.pending).toEqual({})
  })

  it('内容变化时生成新时间戳', () => {
    const result = updatePendingChanges({
      records: records({ calories: 500 }),
      baseline: { [KEY]: baseline({ calories: 400 }) },
      pending: {},
      nextStamp: counter(),
    })
    expect(result.pending[KEY]).toEqual({
      hash: hashRecordData({ calories: 500 }),
      updatedAt: 1001,
      deleted: false,
    })
  })

  it('pending 内容未变时保留原时间戳', () => {
    const data = { calories: 500 }
    const result = updatePendingChanges({
      records: records(data),
      baseline: {},
      pending: {
        [KEY]: { hash: hashRecordData(data), updatedAt: 200, deleted: false },
      },
      nextStamp: counter(),
    })
    expect(result.pending[KEY]?.updatedAt).toBe(200)
  })

  it('已同步记录被删时生成墓碑', () => {
    const result = updatePendingChanges({
      records: new Map(),
      baseline: { [KEY]: baseline({ calories: 400 }) },
      pending: {},
      nextStamp: counter(),
    })
    expect(result.pending[KEY]).toEqual({
      hash: hashRecordData({ calories: 400 }),
      updatedAt: 1001,
      deleted: true,
    })
  })

  it('打卡事件本地缺失时不生成墓碑', () => {
    const key = 'checkins/event-1'
    const result = updatePendingChanges({
      records: new Map(),
      baseline: {
        [key]: baseline({ id: 'event-1' }),
      },
      pending: {
        [key]: { hash: 'x', updatedAt: 1, deleted: false },
      },
      nextStamp: counter(),
    })
    expect(result.pending[key]).toBeUndefined()
  })

  it('未同步过的新记录直接进入 pending', () => {
    const result = updatePendingChanges({
      records: records({ calories: 1 }),
      baseline: {},
      pending: {},
      nextStamp: counter(),
    })
    expect(result.pending[KEY]?.deleted).toBe(false)
  })

  it('删除后重建的记录作为新编辑推送', () => {
    const data = { calories: 1 }
    const result = updatePendingChanges({
      records: records(data),
      baseline: {},
      pending: {
        [KEY]: { hash: hashRecordData(data), updatedAt: 50, deleted: true },
      },
      nextStamp: counter(),
    })
    expect(result.pending[KEY]).toEqual({
      hash: hashRecordData(data),
      updatedAt: 1001,
      deleted: false,
    })
  })

  it('删除未同步过的新记录不会生成墓碑', () => {
    const result = updatePendingChanges({
      records: new Map(),
      baseline: {},
      pending: {
        [KEY]: { hash: 'x', updatedAt: 1, deleted: false },
      },
      nextStamp: counter(),
    })
    expect(result.pending[KEY]).toBeUndefined()
  })
})
