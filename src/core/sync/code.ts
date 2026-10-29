/**
 * 同步码：客户端生成、只在本机保存；服务端只存 SHA-256。
 * 160 位随机数用 Crockford Base32 编码成 32 个字符，按 4 字符分组展示。
 */
export const SYNC_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
export const SYNC_CODE_BYTES = 20
export const SYNC_CODE_LENGTH = 32
export const SYNC_CODE_GROUP_SIZE = 4

/** 把任意字节编码成 Crockford Base32（不足 5 位的尾部丢弃）。 */
export function encodeSyncCode(bytes: Uint8Array): string {
  let buffer = 0
  let bits = 0
  let output = ''

  for (const byte of bytes) {
    buffer = (buffer << 8) | byte
    bits += 8
    while (bits >= 5) {
      bits -= 5
      output += SYNC_CODE_ALPHABET[(buffer >>> bits) & 31]
    }
    buffer &= (1 << bits) - 1
  }

  return output
}

/**
 * 规范化用户输入：忽略空格/短横线，转大写，按 Crockford 规则把
 * I/L 当作 1、O 当作 0。长度或字符不合法时返回 null。
 */
export function normalizeSyncCode(input: unknown): string | null {
  if (typeof input !== 'string') {
    return null
  }

  const compact = input
    .replace(/[\s-]/g, '')
    .toUpperCase()
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0')

  if (compact.length !== SYNC_CODE_LENGTH) {
    return null
  }
  for (const char of compact) {
    if (!SYNC_CODE_ALPHABET.includes(char)) {
      return null
    }
  }
  return compact
}

export function formatSyncCode(code: string): string {
  const normalized = normalizeSyncCode(code)
  if (!normalized) {
    return ''
  }
  const groups: string[] = []
  for (let index = 0; index < normalized.length; index += SYNC_CODE_GROUP_SIZE) {
    groups.push(normalized.slice(index, index + SYNC_CODE_GROUP_SIZE))
  }
  return groups.join('-')
}

export function generateSyncCode(): string {
  const bytes = new Uint8Array(SYNC_CODE_BYTES)
  crypto.getRandomValues(bytes)
  return encodeSyncCode(bytes)
}

function toHex(bytes: Uint8Array): string {
  let output = ''
  for (const byte of bytes) {
    output += byte.toString(16).padStart(2, '0')
  }
  return output
}

/**
 * 同步码的 SHA-256（小写 hex）。服务端存这个值；
 * 非法输入返回 null，调用方统一按未授权处理。
 */
export async function hashSyncCode(code: string): Promise<string | null> {
  const normalized = normalizeSyncCode(code)
  if (!normalized) {
    return null
  }
  const bytes = new TextEncoder().encode(normalized)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return toHex(new Uint8Array(digest))
}
