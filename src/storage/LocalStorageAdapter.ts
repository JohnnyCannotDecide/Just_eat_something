import type { StorageAdapter } from './StorageAdapter'

export const DEFAULT_KEY_PREFIX = 'diet-diary:'

export class LocalStorageAdapter implements StorageAdapter {
  private readonly prefix: string

  constructor(prefix: string = DEFAULT_KEY_PREFIX) {
    this.prefix = prefix
  }

  private storageKey(key: string): string {
    return `${this.prefix}${key}`
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = localStorage.getItem(this.storageKey(key))
    if (raw === null) return null

    try {
      return JSON.parse(raw) as T
    } catch {
      // 坏数据不应该让页面崩掉，交给上层重新初始化。
      return null
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    localStorage.setItem(this.storageKey(key), JSON.stringify(value))
  }

  async remove(key: string): Promise<void> {
    localStorage.removeItem(this.storageKey(key))
  }

  async exportAll(): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {}

    for (let index = 0; index < localStorage.length; index += 1) {
      const storageKey = localStorage.key(index)
      if (storageKey === null || !storageKey.startsWith(this.prefix)) continue

      const raw = localStorage.getItem(storageKey)
      if (raw === null) continue

      try {
        result[storageKey.slice(this.prefix.length)] = JSON.parse(raw) as unknown
      } catch {
        // 导出时跳过损坏项，避免一条坏数据拖垮整个备份。
      }
    }

    return result
  }
}
