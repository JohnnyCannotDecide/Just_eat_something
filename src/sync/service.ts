import { snapshotService, storage } from '@/storage'
import { LocalStorageAdapter } from '@/storage/LocalStorageAdapter'
import { PROD_SYNC_PREFIX } from '@/storage/namespaces'
import { createSyncEngine } from './engine'
import type { SyncEngine } from './engine'
import { createLocalSyncSidecar } from './sidecar'
import { createHttpTransport } from './transport'

/** 同步元数据走独立前缀，和生产 app-data 完全隔离。 */
export const syncSidecar = createLocalSyncSidecar(
  new LocalStorageAdapter(PROD_SYNC_PREFIX),
)

export const syncEngine: SyncEngine = createSyncEngine({
  sidecar: syncSidecar,
  transport: createHttpTransport(),
  images: storage,
  snapshots: snapshotService,
})
