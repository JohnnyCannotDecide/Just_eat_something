/**
 * 打卡事件：追加型事实，印章次数/等级只是缓存。
 * 旧数据在 v5 → v6 迁移时合成确定性事件；之后每次正式打卡只追加。
 */
export interface CheckInEvent {
  /** 全局唯一；旧数据使用确定性 id，新事件使用 UUID。 */
  id: string
  dishId: string
  dateKey: string
  /** 事件序号：旧事件用 dish 内日期下标；新事件用 epoch ms。 */
  createdAt: number
  /** 仅用于补齐历史 checkInCount 的占位事件，不进入 checkInDates。 */
  synthetic?: boolean
}

/** 与 StampRecord 结构一致；单独声明避免 core 反向依赖 storage。 */
export interface StampRecordFields {
  checkInCount: number
  firstCheckInDate: string
  checkInDates: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function nonEmptyText(value: unknown): string | null {
  return isNonEmptyText(value) ? value : null
}

/** 旧数据事件 id：同一天多次打卡靠 dish 内全局下标区分。 */
export function legacyCheckInEventId(
  dishId: string,
  dateKey: string,
  index: number,
): string {
  return `legacy:${dishId}:${dateKey}:${index}`
}

export function missingCheckInEventId(dishId: string, index: number): string {
  return `legacy:${dishId}:missing:${index}`
}

/** 只保留结构完整的对象，按 id 去重并保持原有顺序。 */
export function normalizeCheckInEvents(value: unknown): CheckInEvent[] {
  if (value === undefined) {
    return []
  }
  if (!Array.isArray(value)) {
    throw new TypeError('checkinEvents 必须是数组')
  }

  const events: CheckInEvent[] = []
  const seen = new Set<string>()
  for (const raw of value) {
    if (
      !isRecord(raw) ||
      !isNonEmptyText(raw.id) ||
      !isNonEmptyText(raw.dishId) ||
      !isNonEmptyText(raw.dateKey) ||
      !isFiniteNumber(raw.createdAt) ||
      seen.has(raw.id)
    ) {
      continue
    }
    seen.add(raw.id)
    events.push({
      id: raw.id,
      dishId: raw.dishId,
      dateKey: raw.dateKey,
      createdAt: raw.createdAt,
      ...(raw.synthetic === true ? { synthetic: true } : {}),
    })
  }

  return events
}

function fallbackEventId(now: number): string {
  const cryptoObject = globalThis.crypto
  if (cryptoObject && typeof cryptoObject.randomUUID === 'function') {
    return cryptoObject.randomUUID()
  }
  return `checkin:${now.toString(36)}:${Math.random().toString(36).slice(2, 10)}`
}

export function createCheckInEvent(
  dishId: string,
  dateKey: string,
  now: number,
  id?: string,
): CheckInEvent {
  return {
    id: id ?? fallbackEventId(now),
    dishId,
    dateKey,
    createdAt: now,
  }
}

function compareEvents(a: CheckInEvent, b: CheckInEvent): number {
  if (a.createdAt !== b.createdAt) {
    return a.createdAt - b.createdAt
  }
  if (a.id === b.id) {
    return 0
  }
  return a.id < b.id ? -1 : 1
}

/**
 * 从事件推导印章缓存。checkInCount 计入全部事件（含 synthetic）；
 * checkInDates 只取非 synthetic 事件，并按 (createdAt, id) 稳定排序。
 * 旧缓存里的 firstCheckInDate 优先保留，保证迁移前后展示一致；
 * 没有缓存时回退到最早的事件日期。
 */
export function deriveStampsFromEvents(
  events: readonly CheckInEvent[],
  fallback: Readonly<Record<string, StampRecordFields>> = {},
): Record<string, StampRecordFields> {
  const grouped = new Map<string, CheckInEvent[]>()
  for (const event of events) {
    const list = grouped.get(event.dishId)
    if (list) {
      list.push(event)
    } else {
      grouped.set(event.dishId, [event])
    }
  }

  const stamps: Record<string, StampRecordFields> = {}
  for (const [dishId, list] of grouped) {
    const dated = list
      .filter((event) => event.synthetic !== true)
      .sort(compareEvents)
    stamps[dishId] = {
      checkInCount: list.length,
      firstCheckInDate:
        nonEmptyText(fallback[dishId]?.firstCheckInDate) ??
        dated[0]?.dateKey ??
        '',
      checkInDates: dated.map((event) => event.dateKey),
    }
  }

  // 没有事件的旧印章当作孤儿保留：不计入图鉴进度，但绝不丢数据。
  for (const [dishId, stamp] of Object.entries(fallback)) {
    if (!stamps[dishId]) {
      stamps[dishId] = {
        checkInCount: stamp.checkInCount,
        firstCheckInDate: stamp.firstCheckInDate,
        checkInDates: [...stamp.checkInDates],
      }
    }
  }

  return stamps
}

/**
 * 缓存比事件多出来的次数/日期，用确定性事件补齐，保证次数永不下降。
 * 正常数据不会产生任何事件；只有旧数据/手工改写才会走到这里。
 */
export function reconcileEventsWithStamps(
  events: readonly CheckInEvent[],
  stamps: Readonly<Record<string, StampRecordFields>>,
): CheckInEvent[] {
  const result = [...events]
  const usedIds = new Set(result.map((event) => event.id))

  const nextId = (prefix: string): string => {
    let index = 0
    while (usedIds.has(`${prefix}:${index}`)) {
      index += 1
    }
    const id = `${prefix}:${index}`
    usedIds.add(id)
    return id
  }

  for (const dishId of Object.keys(stamps).sort()) {
    const stamp = stamps[dishId]!
    const dishEvents = result.filter((event) => event.dishId === dishId)
    const datedCount = dishEvents.filter(
      (event) => event.synthetic !== true,
    ).length

    // 补出来的日期事件排在已有日期事件之后，保持旧 checkInDates 顺序。
    const latestCreatedAt = dishEvents.reduce(
      (latest, event) =>
        event.synthetic === true ? latest : Math.max(latest, event.createdAt),
      0,
    )
    const missingDates = stamp.checkInDates.length - datedCount
    for (let index = 0; index < missingDates; index += 1) {
      const offset = datedCount + index
      result.push({
        id: nextId(`reconcile:${dishId}:date`),
        dishId,
        dateKey:
          stamp.checkInDates[offset] ??
          nonEmptyText(stamp.firstCheckInDate) ??
          '1970-01-01',
        createdAt: latestCreatedAt + 1 + index,
      })
    }

    const countAfterDates = dishEvents.length + Math.max(0, missingDates)
    const missingCount = stamp.checkInCount - countAfterDates
    for (let index = 0; index < missingCount; index += 1) {
      result.push({
        id: nextId(`reconcile:${dishId}:count`),
        dishId,
        dateKey:
          nonEmptyText(stamp.firstCheckInDate) ??
          stamp.checkInDates[0] ??
          '1970-01-01',
        createdAt: 0,
        synthetic: true,
      })
    }
  }

  return result
}
