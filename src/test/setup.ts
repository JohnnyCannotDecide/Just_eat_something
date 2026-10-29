// jsdom 没有 IndexedDB，测试前用内存实现补上（只在测试进程里生效）。
import 'fake-indexeddb/auto'

import { beforeEach } from 'vitest'

import { clearTestStorage } from './storage'

beforeEach(() => {
  clearTestStorage()
})
