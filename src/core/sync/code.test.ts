import { describe, expect, it } from 'vitest'

import {
  encodeSyncCode,
  formatSyncCode,
  generateSyncCode,
  hashSyncCode,
  normalizeSyncCode,
  SYNC_CODE_ALPHABET,
  SYNC_CODE_LENGTH,
} from './code'

describe('encodeSyncCode', () => {
  it('全零字节编码为 0，尾部不足 5 位的直接丢弃', () => {
    expect(encodeSyncCode(new Uint8Array([0, 0]))).toBe('000')
  })

  it('160 位全 1 编码为 32 个 Z', () => {
    expect(encodeSyncCode(new Uint8Array(20).fill(0xff))).toBe(
      'Z'.repeat(SYNC_CODE_LENGTH),
    )
  })

  it('只使用 Crockford Base32 字母表', () => {
    const bytes = new Uint8Array(20)
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = (index * 37 + 11) & 0xff
    }
    const code = encodeSyncCode(bytes)
    expect(code).toHaveLength(SYNC_CODE_LENGTH)
    for (const char of code) {
      expect(SYNC_CODE_ALPHABET).toContain(char)
    }
  })
})

describe('normalizeSyncCode', () => {
  const canonical = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

  it('忽略大小写、空格与短横线', () => {
    const formatted = '0123-4567-89ab-cdef-ghjk-mnpq-rstv-wxyz'
    expect(normalizeSyncCode(formatted)).toBe(canonical)
  })

  it('按 Crockford 规则把 I/L 当作 1、O 当作 0', () => {
    const input = 'IIIILLLLOOOO' + '0'.repeat(SYNC_CODE_LENGTH - 12)
    expect(normalizeSyncCode(input)).toBe('1'.repeat(8) + '0'.repeat(24))
  })

  it('长度或字符不合法时返回 null', () => {
    expect(normalizeSyncCode('')).toBeNull()
    expect(normalizeSyncCode('0'.repeat(SYNC_CODE_LENGTH - 1))).toBeNull()
    expect(normalizeSyncCode('0'.repeat(SYNC_CODE_LENGTH + 1))).toBeNull()
    expect(normalizeSyncCode('U'.repeat(SYNC_CODE_LENGTH))).toBeNull()
    expect(normalizeSyncCode(null)).toBeNull()
    expect(normalizeSyncCode(123)).toBeNull()
  })
})

describe('formatSyncCode', () => {
  it('按 4 字符分组', () => {
    expect(formatSyncCode('0'.repeat(SYNC_CODE_LENGTH))).toBe(
      '0000-0000-0000-0000-0000-0000-0000-0000',
    )
  })

  it('接受用户输入的混合格式', () => {
    expect(formatSyncCode('0123 4567 89ab cdef ghjk mnpq rstv wxyz')).toBe(
      '0123-4567-89AB-CDEF-GHJK-MNPQ-RSTV-WXYZ',
    )
  })

  it('非法输入返回空字符串', () => {
    expect(formatSyncCode('too-short')).toBe('')
  })
})

describe('generateSyncCode', () => {
  it('生成 32 位合法码且每次不同', () => {
    const first = generateSyncCode()
    const second = generateSyncCode()
    expect(first).toHaveLength(SYNC_CODE_LENGTH)
    expect(normalizeSyncCode(first)).toBe(first)
    expect(first).not.toBe(second)
  })
})

describe('hashSyncCode', () => {
  it('对规范化后的码做 SHA-256', async () => {
    await expect(hashSyncCode('0'.repeat(SYNC_CODE_LENGTH))).resolves.toBe(
      '84e0c0eafaa95a34c293f278ac52e45ce537bab5e752a00e6959a13ae103b65a',
    )
    await expect(hashSyncCode('Z'.repeat(SYNC_CODE_LENGTH))).resolves.toBe(
      '60bf07c488aad18fda339df07e4fbc47b4f00be71711936f18d04d352ad01890',
    )
  })

  it('格式化输入与紧凑输入得到同一哈希', async () => {
    const compact = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
    const formatted = formatSyncCode(compact)
    await expect(hashSyncCode(formatted)).resolves.toBe(
      await hashSyncCode(compact),
    )
  })

  it('非法码返回 null', async () => {
    await expect(hashSyncCode('nope')).resolves.toBeNull()
  })
})
