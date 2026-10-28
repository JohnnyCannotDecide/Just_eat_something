/**
 * 存储端口。异步签名是为未来的 CloudSyncAdapter 预留空间；
 * 业务代码只依赖这个接口，不直接调用 localStorage。
 */
export interface StorageAdapter {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T): Promise<void>
  remove(key: string): Promise<void>
  /** 导出全部业务键（不含前缀），供设置页导出 JSON 使用。 */
  exportAll(): Promise<Record<string, unknown>>
}
