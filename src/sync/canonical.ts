import type { CheckInEvent } from '@/core/checkinEvents'
import type {
  CustomDish,
  CustomIngredient,
  MealType,
} from '@/core/types'
import {
  APP_DATA_SCHEMA_VERSION,
  createDailyRecord,
  normalizeAppData,
} from '@/storage/appData'
import type {
  AppData,
  DailyRecord,
  MealRecord,
} from '@/storage/appData'
import {
  makeRecordKey,
  parseRecordKey,
} from '@/core/sync/protocol'
import type { SyncCollection } from '@/core/sync/protocol'

const MEALS: readonly MealType[] = ['breakfast', 'lunch', 'dinner']
const DAY_META_ID = 'meta'

export interface CanonicalRecord {
  collection: SyncCollection
  id: string
  data: unknown
}

export type CanonicalMap = Map<string, CanonicalRecord>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isMealType(value: string): value is MealType {
  return (MEALS as readonly string[]).includes(value)
}

/**
 * 把 AppData 投影成可独立合并的记录：
 * - 每天拆成 3 餐 + meta，两台设备同一天各改一餐不会整日 LWW；
 * - stamps 是派生物、schemaVersion 是本地结构，均不同步；
 * - 打卡事件逐条同步，作为不可变事实。
 */
export function canonicalRecords(data: AppData): CanonicalMap {
  const records: CanonicalMap = new Map()
  const add = (
    collection: SyncCollection,
    id: string,
    value: unknown,
  ): void => {
    records.set(makeRecordKey(collection, id), {
      collection,
      id,
      data: value,
    })
  }

  add('meta', 'profile', {
    profile: data.profile,
    targetCalories: data.targetCalories,
  })
  add('meta', 'settings', data.settings)
  add('meta', 'pity', { pityCount: data.pityCount })

  for (const dateKey of Object.keys(data.days).sort()) {
    const day = data.days[dateKey]!
    for (const meal of MEALS) {
      add('days', `${dateKey}/${meal}`, day.meals[meal])
    }
    add('days', `${dateKey}/${DAY_META_ID}`, {
      dateKey,
      tokens: day.tokens,
    })
  }

  for (const dish of data.customDishes) {
    add('customDishes', dish.id, dish)
  }
  for (const ingredient of data.customIngredients) {
    add('customIngredients', ingredient.id, ingredient)
  }
  for (const event of data.checkinEvents) {
    add('checkins', event.id, event)
  }

  return records
}

/** 稳定排序：跨设备合并后数组顺序不随扫描顺序抖动。 */
function sortForStorage(
  customDishes: CustomDish[],
  customIngredients: CustomIngredient[],
  events: CheckInEvent[],
): void {
  customDishes.sort((a, b) => {
    if (a.createdAt !== b.createdAt) {
      return a.createdAt < b.createdAt ? -1 : 1
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
  customIngredients.sort((a, b) => {
    const byName = a.name.localeCompare(b.name)
    return byName !== 0 ? byName : a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
  events.sort((a, b) => {
    if (a.createdAt !== b.createdAt) {
      return a.createdAt - b.createdAt
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

interface DayParts {
  meals: Partial<Record<MealType, MealRecord>>
  tokens: DailyRecord['tokens'] | null
}

/**
 * 反向组装：只接收已决定保留的记录（墓碑与待删除键不传进来）。
 * 失败会抛错，调用方必须整页放弃、不落盘。
 */
export function joinCanonicalRecords(
  liveRecords: Iterable<CanonicalRecord>,
  todayKey: string,
): AppData {
  let profile: AppData['profile'] = null
  let targetCalories: AppData['targetCalories'] = null
  let pityCount = 0
  let settings: AppData['settings'] | null = null
  const dayParts = new Map<string, DayParts>()
  const customDishes: CustomDish[] = []
  const customIngredients: CustomIngredient[] = []
  const checkinEvents: CheckInEvent[] = []

  for (const record of liveRecords) {
    if (!isRecord(record.data) && record.collection !== 'checkins') {
      throw new TypeError(`同步记录 ${record.collection}/${record.id} 不是对象`)
    }

    switch (record.collection) {
      case 'meta': {
        if (record.id === 'profile') {
          const value = record.data as {
            profile?: AppData['profile']
            targetCalories?: AppData['targetCalories']
          }
          profile = value.profile ?? null
          targetCalories = value.targetCalories ?? null
        } else if (record.id === 'settings') {
          settings = record.data as AppData['settings']
        } else if (record.id === 'pity') {
          const value = record.data as { pityCount?: unknown }
          pityCount =
            typeof value.pityCount === 'number'
              ? value.pityCount
              : pityCount
        }
        break
      }

      case 'days': {
        const slash = record.id.indexOf('/')
        if (slash <= 0) {
          throw new TypeError(`同步日记录 id 无效: ${record.id}`)
        }
        const dateKey = record.id.slice(0, slash)
        const part = record.id.slice(slash + 1)
        const parts = dayParts.get(dateKey) ?? {
          meals: {},
          tokens: null,
        }
        if (part === DAY_META_ID) {
          const value = record.data as { tokens?: DailyRecord['tokens'] }
          if (value.tokens) {
            parts.tokens = value.tokens
          }
        } else if (isMealType(part)) {
          parts.meals[part] = record.data as MealRecord
        } else {
          throw new TypeError(`同步日记录部分无效: ${record.id}`)
        }
        dayParts.set(dateKey, parts)
        break
      }

      case 'customDishes':
        customDishes.push(record.data as CustomDish)
        break

      case 'customIngredients':
        customIngredients.push(record.data as CustomIngredient)
        break

      case 'checkins':
        checkinEvents.push(record.data as CheckInEvent)
        break
    }
  }

  const days: Record<string, DailyRecord> = {}
  for (const dateKey of [...dayParts.keys()].sort()) {
    const parts = dayParts.get(dateKey)!
    const day = createDailyRecord(dateKey)
    if (parts.tokens) {
      day.tokens = parts.tokens
    }
    for (const meal of MEALS) {
      const value = parts.meals[meal]
      if (value) {
        day.meals[meal] = value
      }
    }
    days[dateKey] = day
  }

  sortForStorage(customDishes, customIngredients, checkinEvents)

  return normalizeAppData(
    {
      schemaVersion: APP_DATA_SCHEMA_VERSION,
      profile,
      targetCalories,
      pityCount,
      days,
      checkinEvents,
      // stamps 永远是派生缓存；以事件并集重建，避免把缓存当事实同步。
      stamps: {},
      customIngredients,
      customDishes,
      settings: settings ?? {},
    },
    todayKey,
  )
}

/**
 * “空本地”判定：只有档案、保底、事件、自制内容、印章、抽卡券、
 * 候选/已选套餐、已确认热量都为空才算空。今天一条空记录也算空。
 */
export function isEffectivelyEmpty(data: AppData): boolean {
  if (data.profile !== null || data.targetCalories !== null) {
    return false
  }
  if (data.pityCount > 0) {
    return false
  }
  if (data.checkinEvents.length > 0 || Object.keys(data.stamps).length > 0) {
    return false
  }
  if (data.customDishes.length > 0 || data.customIngredients.length > 0) {
    return false
  }

  for (const day of Object.values(data.days)) {
    if (day.tokens.count > 0 || day.tokens.customRewardClaimed) {
      return false
    }
    for (const meal of Object.values(day.meals)) {
      if (
        meal.candidateCombos.length > 0 ||
        meal.selectedCandidateId !== null ||
        meal.calories !== null
      ) {
        return false
      }
    }
  }

  return true
}

export function recordKeyOf(record: CanonicalRecord): string {
  return makeRecordKey(record.collection, record.id)
}

export function parseCanonicalKey(key: string): CanonicalRecord['id'] | null {
  const parsed = parseRecordKey(key)
  return parsed ? parsed.id : null
}
