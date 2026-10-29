/**
 * 同步用的内容指纹：稳定字符串化 + FNV-1a 32 位 + 字节长度。
 * 只用于“内容有没有变”，不用于安全；碰撞最多导致漏推一次。
 */

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null'
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }

  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()

  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`
}

export function fnv1aHex(bytes: Uint8Array): string {
  let hash = 0x811c9dc5
  for (const byte of bytes) {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

function fingerprint(bytes: Uint8Array): string {
  return `${fnv1aHex(bytes)}:${bytes.byteLength}`
}

export function hashRecordData(data: unknown): string {
  return fingerprint(new TextEncoder().encode(stableStringify(data)))
}

export function hashBytes(bytes: Uint8Array): string {
  return fingerprint(bytes)
}
