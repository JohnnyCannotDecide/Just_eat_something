import { afterEach, describe, expect, it } from 'vitest'

import type {
  BinaryStorageAdapter,
  StoredImage,
  StoredImageEntry,
} from '@/storage/BinaryStorageAdapter'
import {
  createDailyRecord,
  createEmptyAppData,
  createMealRecord,
  normalizeAppData,
} from '@/storage/appData'
import type { AppData } from '@/storage/appData'
import type { CustomDish } from '@/core/types'
import type { SnapshotPayload, SnapshotReason } from '@/storage/SnapshotStore'
import type { PrepareImage } from './cloudImage'
import { bytesToBase64 } from './cloudImage'
import { canonicalRecords } from './canonical'
import { noteDestructive } from './destructive'
import { createSyncEngine } from './engine'
import type { SyncEngine } from './engine'
import { hashRecordData } from './hash'
import type { SyncSidecar, SyncState } from './types'
import {
  createEmptySyncState,
  SyncStateCorruptError,
} from './types'
import { SyncTransportError } from './transport'
import type { SyncTransport } from './transport'

const TODAY = '2026-10-29'
const CODE = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const LAST_DAY = '2026-10-28'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

class FakeSidecar implements SyncSidecar {
  code: string | null = null
  state: SyncState | null = null
  corrupt = false
  corruptBackup: string | null = null

  async getCode(): Promise<string | null> {
    return this.code
  }

  async setCode(code: string): Promise<void> {
    this.code = code
  }

  async removeCode(): Promise<void> {
    this.code = null
  }

  async getState(): Promise<SyncState | null> {
    if (this.corrupt) {
      this.corrupt = false
      this.corruptBackup = this.state ? JSON.stringify(this.state) : '{}'
      this.state = null
      throw new SyncStateCorruptError('state:corrupt-backup')
    }
    return this.state ? clone(this.state) : null
  }

  async setState(state: SyncState): Promise<void> {
    this.state = clone(state)
  }

  async removeState(): Promise<void> {
    this.state = null
  }
}

class FakeImages implements BinaryStorageAdapter {
  images = new Map<string, StoredImage>()

  async getImage(key: string): Promise<StoredImage | null> {
    return this.images.get(key) ?? null
  }

  async putImage(key: string, image: StoredImage): Promise<void> {
    this.images.set(key, image)
  }

  async listImages(): Promise<StoredImageEntry[]> {
    return [...this.images].map(([imageId, image]) => ({ imageId, ...image }))
  }

  async putImages(entries: readonly StoredImageEntry[]): Promise<void> {
    for (const entry of entries) {
      this.images.set(entry.imageId, { mime: entry.mime, bytes: entry.bytes })
    }
  }

  async deleteImage(key: string): Promise<void> {
    this.images.delete(key)
  }

  async clearImages(): Promise<void> {
    this.images.clear()
  }
}

interface FakeSnapshot {
  reason: SnapshotReason
  data: AppData | null
}

class FakeSnapshots {
  captured: FakeSnapshot[] = []

  async capture(input: {
    reason: SnapshotReason
    data: AppData | null
  }): Promise<{
    id: string
    createdAt: number
    reason: SnapshotReason
    appSchemaVersion: number | null
    sizeBytes: number
    imageCount: number
  }> {
    this.captured.push({ reason: input.reason, data: input.data })
    return {
      id: `snap-${this.captured.length}`,
      createdAt: Date.now(),
      reason: input.reason,
      appSchemaVersion: input.data?.schemaVersion ?? null,
      sizeBytes: 0,
      imageCount: 0,
    }
  }

  async list() {
    return []
  }

  async read(_id: string): Promise<SnapshotPayload | null> {
    return null
  }

  async remove(): Promise<void> {}
}

interface ServerRecord {
  json: string
  updatedAt: number
  deviceId: string
  deleted: boolean
  rev: number
}

interface ServerImage {
  mime: string
  data: string
  updatedAt: number
  deleted: boolean
  rev: number
}

class FakeServer implements SyncTransport {
  records = new Map<string, ServerRecord>()
  images = new Map<string, ServerImage>()
  rev = 0
  unauthorized = false
  offline = false
  forceProtected = false
  pushCalls = 0
  pullCalls = 0
  statusCalls = 0
  registrations = 0
  rotations = 0

  private gate(): void {
    if (this.offline) {
      throw new SyncTransportError('network')
    }
    if (this.unauthorized) {
      throw new SyncTransportError('unauthorized')
    }
  }

  seedRecord(
    key: string,
    data: unknown,
    updatedAt: number,
    deviceId = 'device-cloud',
    deleted = false,
  ): void {
    this.records.set(key, {
      json: deleted ? 'null' : JSON.stringify(data),
      updatedAt,
      deviceId,
      deleted,
      rev: ++this.rev,
    })
  }

  seedImage(id: string, mime: string, base64: string): void {
    this.images.set(id, {
      mime,
      data: base64,
      updatedAt: 1,
      deleted: false,
      rev: ++this.rev,
    })
  }

  liveRecords(): number {
    return [...this.records.values()].filter((record) => !record.deleted)
      .length
  }

  async register(): Promise<void> {
    this.gate()
    this.registrations += 1
  }

  async status() {
    this.gate()
    this.statusCalls += 1
    return {
      rev: this.rev,
      liveRecords: this.liveRecords(),
      hasData: this.liveRecords() > 0,
      lastUpdatedAt: null,
    }
  }

  async pull(_code: string, input: { recordRev: number; imageRev: number }) {
    this.gate()
    this.pullCalls += 1
    const records = [...this.records.entries()]
      .filter(([, value]) => value.rev > input.recordRev)
      .map(([key, value]) => ({
        key,
        collection: key.slice(0, key.indexOf('/')),
        id: key.slice(key.indexOf('/') + 1),
        json: value.json,
        updatedAt: value.updatedAt,
        deviceId: value.deviceId,
        deleted: value.deleted,
        rev: value.rev,
      }))
    const images = [...this.images.entries()]
      .filter(([, value]) => value.rev > input.imageRev)
      .map(([id, value]) => ({
        id,
        mime: value.mime,
        updatedAt: value.updatedAt,
        deleted: value.deleted,
        rev: value.rev,
      }))
    return {
      records,
      images,
      recordRev: this.rev,
      imageRev: this.rev,
      hasMoreRecords: false,
      hasMoreImages: false,
    }
  }

  private newer(
    change: { updatedAt: number },
    deviceId: string,
    existing: ServerRecord,
  ): boolean {
    if (change.updatedAt !== existing.updatedAt) {
      return change.updatedAt > existing.updatedAt
    }
    return deviceId > existing.deviceId
  }

  async push(
    _code: string,
    request: {
      deviceId: string
      isEmpty: boolean
      changes: {
        key: string
        json?: string
        updatedAt: number
        deleted: boolean
      }[]
    },
  ) {
    this.gate()
    if (this.forceProtected) {
      throw new SyncTransportError('empty-local-protected')
    }
    if (request.isEmpty && this.liveRecords() > 0) {
      throw new SyncTransportError('empty-local-protected')
    }
    this.pushCalls += 1

    let accepted = 0
    for (const change of request.changes) {
      const existing = this.records.get(change.key)
      if (change.key.startsWith('checkins/') && existing) {
        continue
      }
      if (
        existing &&
        !this.newer(change, request.deviceId, existing)
      ) {
        continue
      }
      this.records.set(change.key, {
        json: change.deleted ? 'null' : change.json ?? 'null',
        updatedAt: change.updatedAt,
        deviceId: request.deviceId,
        deleted: change.deleted,
        rev: ++this.rev,
      })
      accepted += 1
    }
    return { rev: this.rev, accepted }
  }

  async rotate(): Promise<void> {
    this.gate()
    this.rotations += 1
  }

  async putImages(
    _code: string,
    input: { deviceId: string; images: { id: string; mime: string; base64: string; updatedAt: number }[] },
  ) {
    this.gate()
    const rev = ++this.rev
    for (const image of input.images) {
      this.images.set(image.id, {
        mime: image.mime,
        data: image.base64,
        updatedAt: image.updatedAt,
        deleted: false,
        rev,
      })
    }
    return { rev }
  }

  async getImages(_code: string, ids: string[]) {
    this.gate()
    return ids
      .map((id) => {
        const image = this.images.get(id)
        if (!image || image.deleted) {
          return null
        }
        return {
          id,
          mime: image.mime,
          data: image.data,
          updatedAt: image.updatedAt,
          rev: image.rev,
        }
      })
      .filter((image): image is NonNullable<typeof image> => image !== null)
  }
}

function makeDish(imageId: string | null): CustomDish {
  return {
    id: 'custom_dish:1',
    name: '番茄炒蛋',
    imageId,
    emoji: '🍅',
    category: 'main',
    meals: ['lunch'],
    rarity: 'R',
    ingredientRows: [],
    calorieMode: 'total',
    calories: 300,
    cooking: null,
    includeInPool: true,
    archived: false,
    createdAt: '2026-10-01',
  }
}

function makeData(
  calories: number | null = 400,
  options: { imageId?: string; includeLastDay?: boolean } = {},
): AppData {
  const base = createEmptyAppData(TODAY)
  const day = createDailyRecord(TODAY)
  day.meals.lunch = { ...createMealRecord(), calories }
  const days: Record<string, ReturnType<typeof createDailyRecord>> = {
    [TODAY]: day,
  }
  if (options.includeLastDay) {
    days[LAST_DAY] = createDailyRecord(LAST_DAY)
  }

  return normalizeAppData(
    {
      ...base,
      profile: {
        sex: 'female',
        age: 30,
        heightCm: 165,
        weightKg: 55,
        activity: 'light',
        goal: 'maintain',
      },
      days,
      customDishes: options.imageId ? [makeDish(options.imageId)] : [],
    },
    TODAY,
  )
}

function enabledState(
  overrides: Partial<SyncState> = {},
): SyncState {
  return {
    ...createEmptySyncState('device-test', 1000),
    enabled: true,
    status: 'idle',
    ...overrides,
  }
}

const engines: SyncEngine[] = []

afterEach(() => {
  while (engines.length > 0) {
    engines.pop()?.dispose()
  }
})

interface HarnessOptions {
  state?: SyncState | null
  code?: string | null
  online?: boolean
  prepareImage?: PrepareImage
}

function harness(options: HarnessOptions = {}) {
  const sidecar = new FakeSidecar()
  sidecar.state = options.state ?? null
  sidecar.code = options.code === undefined ? (options.state ? CODE : null) : options.code
  const server = new FakeServer()
  const images = new FakeImages()
  const snapshots = new FakeSnapshots()
  let online = options.online ?? true
  let now = 5000

  const engine = createSyncEngine({
    sidecar,
    transport: server,
    images,
    snapshots,
    prepareImage:
      options.prepareImage ??
      (async (image) => ({
        mime: image.mime,
        base64: bytesToBase64(image.bytes),
        byteLength: image.bytes.byteLength,
      })),
    now: () => now,
    createDeviceId: () => 'device-test',
    isOnline: () => online,
  })
  engines.push(engine)

  return {
    sidecar,
    server,
    images,
    snapshots,
    engine,
    setOnline(value: boolean) {
      online = value
    },
    tick() {
      now += 1
    },
  }
}

describe('sync engine', () => {
  it('空本地 + 云端有数据：只拉取，不推送', async () => {
    const h = harness({ state: enabledState() })
    const cloud = makeData(520)
    h.server.seedRecord(
      'meta/profile',
      canonicalRecords(cloud).get('meta/profile')!.data,
      100,
    )
    h.server.seedRecord('days/2026-10-29/lunch', {
      ...createMealRecord(),
      calories: 520,
    }, 100)

    const result = await h.engine.sync(createEmptyAppData(TODAY), TODAY)

    expect(result.status).toBe('idle')
    expect(result.data?.days[TODAY]?.meals.lunch.calories).toBe(520)
    expect(h.server.pushCalls).toBe(0)
    expect(h.sidecar.state?.pending).toEqual({})
  })

  it('两边都有数据时只返回 needs-choice，不写同步码或状态', async () => {
    const h = harness()
    h.server.seedRecord(
      'meta/profile',
      canonicalRecords(makeData(400)).get('meta/profile')!.data,
      100,
    )

    const result = await h.engine.connect(CODE, makeData(400), TODAY)

    expect(result.status).toBe('needs-choice')
    expect(result.data).toBeNull()
    expect(h.sidecar.code).toBeNull()
    expect(h.sidecar.state).toBeNull()
  })

  it('本地有、云端空：确认上传后才保存同步码并推送', async () => {
    const h = harness()
    const data = makeData(400)

    const connected = await h.engine.connect(CODE, data, TODAY)
    expect(connected.status).toBe('needs-upload')
    expect(h.sidecar.code).toBeNull()

    const result = await h.engine.choose('upload', data, TODAY)
    expect(result.status).toBe('idle')
    expect(h.sidecar.code).toBe(CODE)
    expect(h.server.liveRecords()).toBeGreaterThan(0)
    expect(h.server.pushCalls).toBe(1)
  })

  it('本地空、云端有：连接后自动恢复', async () => {
    const h = harness()
    const cloud = makeData(520)
    h.server.seedRecord(
      'meta/profile',
      canonicalRecords(cloud).get('meta/profile')!.data,
      100,
    )
    h.server.seedRecord(
      'days/2026-10-29/lunch',
      canonicalRecords(cloud).get('days/2026-10-29/lunch')!.data,
      100,
    )

    const result = await h.engine.connect(
      CODE,
      createEmptyAppData(TODAY),
      TODAY,
    )

    expect(result.status).toBe('idle')
    expect(result.data?.days[TODAY]?.meals.lunch.calories).toBe(520)
    expect(h.sidecar.code).toBe(CODE)
    expect(h.server.pushCalls).toBe(0)
  })

  it('LWW：云端更新的记录覆盖本地，并更新 baseline', async () => {
    const local = makeData(400)
    const cloud = makeData(520)
    const key = 'days/2026-10-29/lunch'
    const localCanonical = canonicalRecords(local).get(key)!.data

    const h = harness({
      state: enabledState({
        baseline: {
          [key]: {
            hash: hashRecordData(localCanonical),
            updatedAt: 100,
            deviceId: 'device-test',
            rev: 1,
          },
        },
      }),
    })
    h.server.seedRecord(key, canonicalRecords(cloud).get(key)!.data, 200)

    const result = await h.engine.sync(local, TODAY)

    expect(result.data?.days[TODAY]?.meals.lunch.calories).toBe(520)
    expect(h.sidecar.state?.baseline[key]?.updatedAt).toBe(200)
    expect(localCanonical).not.toEqual(
      canonicalRecords(cloud).get(key)!.data,
    )
  })

  it('401 时进入 auth-failed，数据不变，pending 保留', async () => {
    const h = harness({ state: enabledState() })
    h.server.unauthorized = true

    const result = await h.engine.sync(makeData(400), TODAY)

    expect(result.status).toBe('auth-failed')
    expect(result.data).toBeNull()
    expect(h.sidecar.state?.pending).not.toEqual({})
    expect(h.server.pushCalls).toBe(0)
  })

  it('离线时保存 pending，恢复后只推送一次且跨实例保留', async () => {
    const local = makeData(400)
    const offline = harness({ state: enabledState(), online: false })

    const first = await offline.engine.sync(local, TODAY)
    expect(first.status).toBe('offline')
    expect(offline.sidecar.state?.pending).not.toEqual({})

    const online = harness({ state: offline.sidecar.state })
    const resumed = await online.engine.sync(local, TODAY)
    expect(resumed.status).toBe('idle')
    expect(online.server.pushCalls).toBe(1)

    const second = await online.engine.sync(local, TODAY)
    expect(second.data).toBeNull()
    expect(online.server.pushCalls).toBe(1)
    expect(online.sidecar.state?.pending).toEqual({})
  })

  it('删除已同步的历史记录会推送墓碑', async () => {
    const data = makeData(400, { includeLastDay: true })
    const key = `days/${LAST_DAY}/lunch`
    const withLastDay = harness({ state: enabledState() })
    const first = await withLastDay.engine.sync(data, TODAY)
    expect(first.status).toBe('idle')

    const withoutLastDay = makeData(400)
    const result = await withLastDay.engine.sync(withoutLastDay, TODAY)
    expect(result.status).toBe('idle')
    expect(withLastDay.server.records.get(key)?.deleted).toBe(true)
  })

  it('上传被引用的图片，并跳过压缩失败', async () => {
    const data = makeData(400, { imageId: 'img-1' })
    const h = harness({ state: enabledState() })
    h.images.putImage('img-1', {
      mime: 'image/webp',
      bytes: new Uint8Array([1, 2, 3]),
    })

    const result = await h.engine.sync(data, TODAY)
    expect(result.status).toBe('idle')
    expect(h.server.images.get('img-1')?.data).toBe(
      bytesToBase64(new Uint8Array([1, 2, 3])),
    )

    const skip = harness({
      state: enabledState(),
      prepareImage: async () => null,
    })
    skip.images.putImage('img-1', {
      mime: 'image/webp',
      bytes: new Uint8Array([9, 9]),
    })
    const skipped = await skip.engine.sync(data, TODAY)
    expect(skipped.status).toBe('idle')
    expect(skip.server.images.has('img-1')).toBe(false)
    expect(skipped.warnings.join('')).toContain('已跳过同步')
  })

  it('下载云端新增图片，且绝不覆盖本地已有图片', async () => {
    const cloud = makeData(520, { imageId: 'img-1' })
    const key = 'days/2026-10-29/lunch'
    const h = harness({ state: enabledState() })
    h.server.seedRecord(
      'customDishes/custom_dish:1',
      canonicalRecords(cloud).get('customDishes/custom_dish:1')!.data,
      100,
    )
    h.server.seedRecord(key, canonicalRecords(cloud).get(key)!.data, 100)
    h.server.seedImage('img-1', 'image/webp', bytesToBase64(new Uint8Array([7, 7, 7])))

    const result = await h.engine.sync(createEmptyAppData(TODAY), TODAY)
    expect(result.status).toBe('idle')
    expect(h.images.images.get('img-1')?.bytes).toEqual(
      new Uint8Array([7, 7, 7]),
    )

    const existing = harness({ state: enabledState() })
    existing.server.seedRecord(
      'customDishes/custom_dish:1',
      canonicalRecords(cloud).get('customDishes/custom_dish:1')!.data,
      100,
    )
    existing.server.seedRecord(key, canonicalRecords(cloud).get(key)!.data, 100)
    existing.server.seedImage(
      'img-1',
      'image/webp',
      bytesToBase64(new Uint8Array([7, 7, 7])),
    )
    existing.images.putImage('img-1', {
      mime: 'image/jpeg',
      bytes: new Uint8Array([1, 1]),
    })

    await existing.engine.sync(createEmptyAppData(TODAY), TODAY)
    expect(existing.images.images.get('img-1')?.bytes).toEqual(
      new Uint8Array([1, 1]),
    )
  })

  it('服务端 409 时保留 pending 并提示确认', async () => {
    const h = harness({ state: enabledState() })
    h.server.forceProtected = true

    const result = await h.engine.sync(makeData(400), TODAY)
    expect(result.status).toBe('needs-confirm')
    expect(result.data).toBeNull()
    expect(h.sidecar.state?.pending).not.toEqual({})
  })

  it('清空/导入/恢复后进入 needs-confirm，且不自动拉回云端', async () => {
    const h = harness({ state: enabledState() })
    h.server.seedRecord(
      'meta/profile',
      canonicalRecords(makeData(400)).get('meta/profile')!.data,
      100,
    )
    const data = createEmptyAppData(TODAY)

    noteDestructive('clear')
    const result = await h.engine.sync(data, TODAY)

    expect(result.status).toBe('needs-confirm')
    expect(result.data).toBeNull()
    expect(h.server.pullCalls).toBe(0)
    expect(h.server.pushCalls).toBe(0)
    expect(h.sidecar.state?.needsReconcile).toBe('clear')
  })

  it('轮换同步码与关闭同步不丢本地数据', async () => {
    const h = harness({ state: enabledState() })

    const rotated = await h.engine.rotate()
    expect(rotated.error).toBeNull()
    expect(rotated.code).not.toBe(CODE)
    expect(h.server.rotations).toBe(1)
    expect(h.sidecar.code).toBe(rotated.code)

    await h.engine.disable()
    expect(h.sidecar.state?.enabled).toBe(false)
    expect(h.sidecar.code).toBe(rotated.code)

    const result = await h.engine.sync(makeData(400), TODAY)
    expect(result.status).toBe('disabled')
    expect(result.data).toBeNull()
  })

  it('sidecar 损坏时只备份并返回 needs-confirm', async () => {
    const h = harness({ state: enabledState() })
    h.sidecar.corrupt = true

    const view = await h.engine.getView()
    expect(view.status).toBe('needs-confirm')

    const result = await h.engine.sync(makeData(400), TODAY)
    expect(result.status).toBe('needs-confirm')
    expect(result.data).toBeNull()
    expect(h.sidecar.corruptBackup).not.toBeNull()
    expect(h.sidecar.state).toBeNull()
  })

  it('以云端为准会先快照再替换本地', async () => {
    const h = harness({
      state: enabledState(),
    })
    const cloud = makeData(520)
    h.server.seedRecord(
      'meta/profile',
      canonicalRecords(cloud).get('meta/profile')!.data,
      100,
    )
    h.server.seedRecord(
      'days/2026-10-29/lunch',
      canonicalRecords(cloud).get('days/2026-10-29/lunch')!.data,
      100,
    )

    const result = await h.engine.choose('cloud', makeData(400), TODAY)

    expect(result.status).toBe('idle')
    expect(result.data?.days[TODAY]?.meals.lunch.calories).toBe(520)
    expect(h.snapshots.captured.map((item) => item.reason)).toContain(
      'before-cloud-restore',
    )
  })

  it('合并冲突时本地较新的编辑保留并推送', async () => {
    const local = makeData(900)
    const key = 'days/2026-10-29/lunch'
    const h = harness({ state: enabledState() })
    h.server.seedRecord(
      key,
      canonicalRecords(makeData(100)).get(key)!.data,
      100,
    )

    const result = await h.engine.sync(local, TODAY)

    expect(result.status).toBe('idle')
    expect(h.server.records.get(key)?.json).toBe(
      JSON.stringify(canonicalRecords(local).get(key)!.data),
    )
    expect(h.server.records.get(key)?.updatedAt).toBeGreaterThan(100)
  })
})
