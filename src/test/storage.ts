import {
  TEST_STORAGE_PREFIX,
  TEST_SYNC_PREFIX,
} from '@/storage/namespaces'

/** 只清测试命名空间，绝不碰正式 `diet-diary:` 键。 */
export function clearTestStorage(): void {
  const keys: string[] = []
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)
    if (
      key !== null &&
      (key.startsWith(TEST_STORAGE_PREFIX) ||
        key.startsWith(TEST_SYNC_PREFIX))
    ) {
      keys.push(key)
    }
  }
  for (const key of keys) {
    localStorage.removeItem(key)
  }
}
