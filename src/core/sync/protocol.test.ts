import { describe, expect, it } from 'vitest'

import { SYNC } from '../../config/gameConfig'

import {
  base64DecodedByteLength,
  clampClientTimestamp,
  compareSyncVersions,
  isValidCodeHash,
  isValidDeviceId,
  isValidImageId,
  isSyncImageMime,
  makeRecordKey,
  parseRecordJsonObject,
  parseRecordKey,
  RECORD_ID_MAX_LENGTH,
  RECORD_KEY_MAX_LENGTH,
} from './protocol'

describe('parseRecordKey', () => {
  it('只在第一个斜杠处切分', () => {
    expect(parseRecordKey('days/2026-10-29/lunch')).toEqual({
      collection: 'days',
      id: '2026-10-29/lunch',
    })
    expect(parseRecordKey('checkins/legacy:dish:2026-10-29:0')).toEqual({
      collection: 'checkins',
      id: 'legacy:dish:2026-10-29:0',
    })
  })

  it('拒绝未知集合与畸形键', () => {
    for (const key of [
      '',
      '/x',
      'meta/',
      'unknown/x',
      'meta//x',
      'meta/x/',
      `meta/${'a'.repeat(RECORD_ID_MAX_LENGTH + 1)}`,
      `meta/${'a'.repeat(RECORD_KEY_MAX_LENGTH)}`,
      'meta/a\u0000b',
      'meta/a\nb',
    ]) {
      expect(parseRecordKey(key)).toBeNull()
    }
    expect(parseRecordKey(42)).toBeNull()
  })

  it('接受最长合法 id', () => {
    const key = makeRecordKey('meta', 'a'.repeat(RECORD_ID_MAX_LENGTH))
    expect(parseRecordKey(key)).toEqual({
      collection: 'meta',
      id: 'a'.repeat(RECORD_ID_MAX_LENGTH),
    })
  })
})

describe('isValidDeviceId', () => {
  it('接受常见设备 id', () => {
    for (const value of ['a', 'device-1', 'a_b:c.d', 'A'.repeat(64)]) {
      expect(isValidDeviceId(value)).toBe(true)
    }
  })

  it('拒绝空、超长和含空白的值', () => {
    for (const value of ['', 'a b', '设备', 'a'.repeat(65)]) {
      expect(isValidDeviceId(value)).toBe(false)
    }
    expect(isValidDeviceId(undefined)).toBe(false)
  })
})

describe('isValidCodeHash', () => {
  it('只接受 64 位小写 hex', () => {
    expect(isValidCodeHash('a'.repeat(64))).toBe(true)
    expect(isValidCodeHash('A'.repeat(64))).toBe(false)
    expect(isValidCodeHash('a'.repeat(63))).toBe(false)
    expect(isValidCodeHash('g'.repeat(64))).toBe(false)
  })
})

describe('isValidImageId', () => {
  it('接受无空白 id', () => {
    expect(isValidImageId('img-1_2')).toBe(true)
    expect(isValidImageId('image:test/1')).toBe(true)
  })

  it('拒绝空、超长、空白和控制字符', () => {
    expect(isValidImageId('')).toBe(false)
    expect(isValidImageId('a b')).toBe(false)
    expect(isValidImageId('a\nb')).toBe(false)
    expect(isValidImageId('a'.repeat(161))).toBe(false)
    expect(isValidImageId(null)).toBe(false)
  })
})

describe('isSyncImageMime', () => {
  it('只允许 jpeg/png/webp', () => {
    expect(isSyncImageMime('image/jpeg')).toBe(true)
    expect(isSyncImageMime('image/png')).toBe(true)
    expect(isSyncImageMime('image/webp')).toBe(true)
    expect(isSyncImageMime('image/gif')).toBe(false)
    expect(isSyncImageMime(undefined)).toBe(false)
  })
})

describe('base64DecodedByteLength', () => {
  it('计算合法 base64 的字节数', () => {
    expect(base64DecodedByteLength('YWJj')).toBe(3)
    expect(base64DecodedByteLength('YQ==')).toBe(1)
    expect(base64DecodedByteLength('YWI=')).toBe(2)
  })

  it('非法输入返回 null', () => {
    for (const value of ['', 'abc', 'YWJj=', 'YWJj====', '!!!!', 'YW Jj']) {
      expect(base64DecodedByteLength(value)).toBeNull()
    }
    expect(base64DecodedByteLength(null)).toBeNull()
  })
})

describe('compareSyncVersions', () => {
  it('时间新者胜', () => {
    expect(
      compareSyncVersions(
        { updatedAt: 2, deviceId: 'a' },
        { updatedAt: 1, deviceId: 'z' },
      ),
    ).toBeGreaterThan(0)
  })

  it('同时间按 deviceId 字典序稳定决胜', () => {
    expect(
      compareSyncVersions(
        { updatedAt: 1, deviceId: 'b' },
        { updatedAt: 1, deviceId: 'a' },
      ),
    ).toBeGreaterThan(0)
    expect(
      compareSyncVersions(
        { updatedAt: 1, deviceId: 'a' },
        { updatedAt: 1, deviceId: 'b' },
      ),
    ).toBeLessThan(0)
  })

  it('完全相同返回 0', () => {
    expect(
      compareSyncVersions(
        { updatedAt: 1, deviceId: 'a' },
        { updatedAt: 1, deviceId: 'a' },
      ),
    ).toBe(0)
  })
})

describe('clampClientTimestamp', () => {
  const now = 1_000_000

  it('取整并限制最大超前量', () => {
    expect(clampClientTimestamp(1234.9, now)).toBe(1234)
    expect(clampClientTimestamp(now + 10 * 60 * 1000, now)).toBe(
      now + SYNC.maxClockSkewMs,
    )
  })

  it('拒绝非法时间', () => {
    for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY, '1', null]) {
      expect(clampClientTimestamp(value, now)).toBeNull()
    }
  })
})

describe('parseRecordJsonObject', () => {
  it('接受普通对象', () => {
    expect(parseRecordJsonObject('{"a":1}')).toEqual({ a: 1 })
  })

  it('拒绝非对象、非法 JSON 与超长文本', () => {
    for (const value of ['', '[]', 'null', '"x"', '1', '{', undefined]) {
      expect(parseRecordJsonObject(value)).toBeNull()
    }
    const tooLong = `{"a":"${'x'.repeat(SYNC.maxRecordJsonBytes)}"}`
    expect(parseRecordJsonObject(tooLong)).toBeNull()
  })
})
