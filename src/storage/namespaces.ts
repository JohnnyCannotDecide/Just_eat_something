/**
 * 存储命名空间。生产数据只能落在 prod 命名空间；测试与开发工具必须显式使用
 * test_ / dev_，避免误清或误写真实用户数据。
 */
export type StorageNamespace = 'prod' | 'dev' | 'test'

export const PROD_STORAGE_PREFIX = 'diet-diary:'
export const DEV_STORAGE_PREFIX = 'dev_diet-diary:'
export const TEST_STORAGE_PREFIX = 'test_diet-diary:'

export const PROD_IMAGE_DB_NAME = 'diet-diary'
export const DEV_IMAGE_DB_NAME = 'dev_diet-diary-images'
export const TEST_IMAGE_DB_NAME = 'test_diet-diary-images'

export const PROD_SNAPSHOT_DB_NAME = 'diet-diary-snapshots'
export const DEV_SNAPSHOT_DB_NAME = 'dev_diet-diary-snapshots'
export const TEST_SNAPSHOT_DB_NAME = 'test_diet-diary-snapshots'

const STORAGE_PREFIXES: Record<StorageNamespace, string> = {
  prod: PROD_STORAGE_PREFIX,
  dev: DEV_STORAGE_PREFIX,
  test: TEST_STORAGE_PREFIX,
}

const IMAGE_DB_NAMES: Record<StorageNamespace, string> = {
  prod: PROD_IMAGE_DB_NAME,
  dev: DEV_IMAGE_DB_NAME,
  test: TEST_IMAGE_DB_NAME,
}

const SNAPSHOT_DB_NAMES: Record<StorageNamespace, string> = {
  prod: PROD_SNAPSHOT_DB_NAME,
  dev: DEV_SNAPSHOT_DB_NAME,
  test: TEST_SNAPSHOT_DB_NAME,
}

export function storagePrefix(namespace: StorageNamespace = 'prod'): string {
  return STORAGE_PREFIXES[namespace]
}

export function imageDbName(namespace: StorageNamespace = 'prod'): string {
  return IMAGE_DB_NAMES[namespace]
}

export function snapshotDbName(namespace: StorageNamespace = 'prod'): string {
  return SNAPSHOT_DB_NAMES[namespace]
}

export function dataTransferLockName(
  namespace: StorageNamespace = 'prod',
): string {
  return `${storagePrefix(namespace)}data-transfer`
}
