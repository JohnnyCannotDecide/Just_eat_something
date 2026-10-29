import {
  ACTIVITY_LEVELS,
  DEFAULT_THEME,
  GOAL_ADJUSTMENTS,
  MEALS,
  RARITY_ORDER,
  customDishAllowedRarities,
  isThemeName,
} from '@/config/gameConfig'
import type { ThemeName } from '@/config/gameConfig'
import {
  deriveStampsFromEvents,
  legacyCheckInEventId,
  missingCheckInEventId,
  normalizeCheckInEvents,
  reconcileEventsWithStamps,
} from '@/core/checkinEvents'
import type { CheckInEvent } from '@/core/checkinEvents'
import {
  createLegacyCandidate,
  createLegacyCustomCandidate,
} from '@/core/components'
import { toDateKey } from '@/core/dateKey'
import { createMealDrawBudget } from '@/core/drawBudget'
import type { MealDrawBudget } from '@/core/drawBudget'
import { calcTargetCalories } from '@/core/targetCalories'
import { createTokenWallet, normalizeTokenWallet } from '@/core/tokens'
import type { TokenWallet } from '@/core/tokens'
import type {
  ActivityLevel,
  BodyProfile,
  CalorieGoal,
  CalorieMode,
  ComboCandidateSnapshot,
  ComboNameSource,
  ComboSource,
  ComponentIngredientSnapshot,
  ComponentKind,
  ComponentOrigin,
  CookingInfo,
  CustomDish,
  CustomDishIngredientRow,
  CustomIngredient,
  DishCategory,
  MealComponentSnapshot,
  MealType,
  Rarity,
  Sex,
} from '@/core/types'
import {
  COOKING_STEP_MAX,
  COOKING_STEP_MAX_CHARS,
  COOKING_STEP_MIN,
  COOKING_TIME_MAX_MINUTES,
  countUnicodeChars,
  isCookingMethod,
  isDishCategory,
  isMealType,
} from '@/data/dataRules'

import { comboById } from '@/data'

import { LEGACY_COMBO_NAMES } from './legacyComboNames'
import type { SnapshotService } from './snapshots'
import type { StorageAdapter } from './StorageAdapter'

export const APP_DATA_SCHEMA_VERSION = 6
export const APP_DATA_STORAGE_KEY = 'app-data'
/** 结构损坏但仍是合法 JSON 时，原始值会先备份到这里再以空数据启动。 */
export const APP_DATA_CORRUPT_BACKUP_KEY = 'app-data:corrupt-backup'

export interface AppSettings {
  showCalories: boolean
  /** 今日页游客提示是否已被用户关闭。 */
  profileHintDismissed: boolean
  /** 展示主题；缺失或值非法时回退 cute。 */
  theme: ThemeName
}

export interface MealRecord {
  /** 本餐抽到的全部套餐，顺序保留。 */
  candidateCombos: ComboCandidateSnapshot[]
  /** 最终选中的套餐；未选时为 null。 */
  selectedCandidateId: string | null
  /** 确认后的餐次热量；未打卡时为 null。 */
  calories: number | null
  /** 复用核心的 baseUsed / adUsed / checkedIn。 */
  budget: MealDrawBudget
  /** 本轮已经抽到的套餐 id；旧数据缺省时从候选推导。 */
  drawnComboIds?: string[]
}

export interface DailyRecord {
  dateKey: string
  meals: Record<MealType, MealRecord>
  /** 当天全局抽卡券；跨天时由 ensureToday 重置。 */
  tokens: TokenWallet
}

export interface StampRecord {
  checkInCount: number
  firstCheckInDate: string
  /** 每次正式菜品打卡日期，同一日期可重复出现。 */
  checkInDates: string[]
}

export interface AppData {
  schemaVersion: number
  profile: BodyProfile | null
  /** 由 profile 计算并缓存；profile 为空时为 null。 */
  targetCalories: number | null
  /** 全局保底计数，跨餐/跨天保留。 */
  pityCount: number
  /** YYYY-MM-DD → 当日记录，保留历史。 */
  days: Record<string, DailyRecord>
  /** 追加型打卡事件；次数和等级由这里推导。 */
  checkinEvents: CheckInEvent[]
  /** dishId → 印章缓存；始终由 checkinEvents 重建，仅作读取加速。 */
  stamps: Record<string, StampRecord>
  /** 用户自建的食材。 */
  customIngredients: CustomIngredient[]
  /** 用户自建的菜谱；图片本身存在 IndexedDB。 */
  customDishes: CustomDish[]
  /** 展示偏好；老数据缺失时由 normalize 补齐。 */
  settings: AppSettings
}

type UnknownRecord = Record<string, unknown>
export type AppDataMigration = (data: UnknownRecord) => UnknownRecord

/** 迁移链：目标版本 → 从上一版升级到该版本的纯函数。 */
const APP_DATA_MIGRATIONS: Record<number, AppDataMigration> = {
  2: migrateV1ToV2,
  3: migrateV2ToV3,
  4: migrateV3ToV4,
  5: migrateV4ToV5,
  6: migrateV5ToV6,
}

export function createMealRecord(): MealRecord {
  return {
    candidateCombos: [],
    selectedCandidateId: null,
    calories: null,
    budget: createMealDrawBudget(),
    drawnComboIds: [],
  }
}

/** v1 单菜记录 → v2 单部件临时套餐；纯函数且可重复调用。 */
export function migrateV1ToV2(raw: UnknownRecord): UnknownRecord {
  if (
    typeof raw.schemaVersion === 'number' &&
    raw.schemaVersion >= 2
  ) {
    return raw
  }

  if (!isRecord(raw.days)) {
    return { ...raw, schemaVersion: 2 }
  }

  const days: UnknownRecord = {}
  for (const [dateKey, rawDay] of Object.entries(raw.days)) {
    if (!isRecord(rawDay)) {
      days[dateKey] = rawDay
      continue
    }
    days[dateKey] = migrateV1Day(rawDay, dateKey)
  }

  return { ...raw, schemaVersion: 2, days }
}

/**
 * v2 → v3：热量展示改为默认开启。
 * v2 无法区分「用户主动关闭」和「旧版无档案强制关闭」，按 v3 规则统一置为 true。
 * 其余设置（如 profileHintDismissed）与未知字段原样保留。
 */
export function migrateV2ToV3(raw: UnknownRecord): UnknownRecord {
  if (
    typeof raw.schemaVersion === 'number' &&
    raw.schemaVersion >= 3
  ) {
    return raw
  }

  const settings = isRecord(raw.settings) ? raw.settings : {}
  return {
    ...raw,
    schemaVersion: 3,
    settings: {
      ...settings,
      showCalories: true,
      theme: isThemeName(settings.theme) ? settings.theme : DEFAULT_THEME,
    },
  }
}

function nonEmptyText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function isComboNameSource(value: unknown): value is ComboNameSource {
  return value === 'auto' || value === 'manual' || value === 'legacy'
}

function truncateName(value: string): string {
  return Array.from(value).slice(0, 10).join('')
}

function activeDishIdsFromComponents(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  const ids: string[] = []
  for (const item of value) {
    if (
      !isRecord(item) ||
      item.discarded === true ||
      item.kind !== 'dish' ||
      typeof item.dishId !== 'string' ||
      item.dishId.length === 0
    ) {
      continue
    }
    ids.push(item.dishId)
  }
  return ids
}

function fallbackCandidateName(raw: UnknownRecord): string {
  const baseName = nonEmptyText(raw.baseName)
  if (baseName) {
    return baseName
  }

  const comboId = typeof raw.comboId === 'string' ? raw.comboId : null
  const legacyName = comboId ? LEGACY_COMBO_NAMES[comboId] : undefined
  if (legacyName) {
    return legacyName
  }

  if (Array.isArray(raw.components)) {
    const names: string[] = []
    for (const item of raw.components) {
      if (!isRecord(item) || item.discarded === true) {
        continue
      }
      const name = nonEmptyText(item.name)
      if (name) {
        names.push(name)
      }
    }
    if (names.length > 0) {
      return truncateName(names.slice(0, 2).join('和'))
    }
  }

  return '旧套餐'
}

function migrateCandidateV4(value: unknown): unknown {
  if (!isRecord(value)) {
    return value
  }

  const name = nonEmptyText(value.name) ?? fallbackCandidateName(value)
  const manualName = nonEmptyText(value.manualName)
  const nameSource: ComboNameSource = isComboNameSource(value.nameSource)
    ? value.nameSource
    : manualName
      ? 'manual'
      : 'legacy'
  const comboId = typeof value.comboId === 'string' ? value.comboId : null
  const combo = comboId ? comboById.get(comboId) : undefined
  const existingBaseDishIds =
    Array.isArray(value.baseDishIds) &&
    value.baseDishIds.every((id) => typeof id === 'string')
      ? (value.baseDishIds as string[])
      : null
  const baseDishIds =
    existingBaseDishIds ??
    combo?.components ??
    activeDishIdsFromComponents(value.components)
  const finalManual = manualName ?? (nameSource === 'manual' ? name : null)

  const migrated: UnknownRecord = {
    ...value,
    name,
    nameSource,
    baseName: nonEmptyText(value.baseName) ?? name,
    baseDishIds: [...baseDishIds],
  }
  if (finalManual) {
    migrated.manualName = finalManual
  }
  return migrated
}

/**
 * v3 → v4：套餐命名快照。
 * v3 及更早只有 name，没有命名来源、手动名和原始组合基准；
 * 缺失 name 的旧候选按“原名”兜底，绝不因为缺名字丢弃候选。
 */
export function migrateV3ToV4(raw: UnknownRecord): UnknownRecord {
  if (
    typeof raw.schemaVersion === 'number' &&
    raw.schemaVersion >= 4
  ) {
    return raw
  }

  if (!isRecord(raw.days)) {
    return { ...raw, schemaVersion: 4 }
  }

  const days: UnknownRecord = {}
  for (const [dateKey, rawDay] of Object.entries(raw.days)) {
    if (!isRecord(rawDay)) {
      days[dateKey] = rawDay
      continue
    }
    const rawMeals = isRecord(rawDay.meals) ? rawDay.meals : {}
    const meals: UnknownRecord = { ...rawMeals }
    for (const meal of MEALS) {
      const rawMeal = rawMeals[meal.type]
      if (!isRecord(rawMeal) || !Array.isArray(rawMeal.candidateCombos)) {
        continue
      }
      meals[meal.type] = {
        ...rawMeal,
        candidateCombos: rawMeal.candidateCombos.map(migrateCandidateV4),
      }
    }
    days[dateKey] = { ...rawDay, meals }
  }

  return { ...raw, schemaVersion: 4, days }
}

function uniqueStringIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null
  }
  const ids = value.filter(
    (id): id is string => typeof id === 'string' && id.length > 0,
  )
  // 全部无效时视为缺省，交给调用方回退；部分无效只丢弃无效项，保留有效数据。
  if (value.length > 0 && ids.length === 0) {
    return null
  }
  return [...new Set(ids)]
}

function migrateComponentV5(value: unknown, checkedIn: boolean): unknown {
  if (!isRecord(value)) {
    return value
  }

  const existing = uniqueStringIds(value.seenDishIds)
  if (existing) {
    return { ...value, seenDishIds: existing }
  }

  const dishId =
    value.kind === 'dish' &&
    typeof value.dishId === 'string' &&
    value.dishId.length > 0
      ? value.dishId
      : null
  return {
    ...value,
    seenDishIds: checkedIn || dishId === null ? [] : [dishId],
  }
}

function migrateCandidateV5(value: unknown, checkedIn: boolean): unknown {
  if (!isRecord(value) || !Array.isArray(value.components)) {
    return value
  }
  return {
    ...value,
    components: value.components.map((component) =>
      migrateComponentV5(component, checkedIn),
    ),
  }
}

function migrateMealV5(value: unknown): unknown {
  if (!isRecord(value)) {
    return value
  }

  const checkedIn =
    isRecord(value.budget) && value.budget.checkedIn === true
  const candidateCombos = Array.isArray(value.candidateCombos)
    ? value.candidateCombos.map((candidate) =>
        migrateCandidateV5(candidate, checkedIn),
      )
    : value.candidateCombos

  let drawnComboIds = uniqueStringIds(value.drawnComboIds)
  if (!drawnComboIds && Array.isArray(candidateCombos)) {
    drawnComboIds = [
      ...new Set(
        candidateCombos.flatMap((candidate) =>
          isRecord(candidate) &&
          typeof candidate.comboId === 'string' &&
          candidate.comboId.length > 0
            ? [candidate.comboId]
            : [],
        ),
      ),
    ]
  }

  return {
    ...value,
    ...(candidateCombos !== undefined ? { candidateCombos } : {}),
    ...(drawnComboIds ? { drawnComboIds } : {}),
  }
}

/**
 * v4 → v5：部件槽位 seenDishIds 与套餐本轮抽取记录。
 * 开放中的候选初始 seen 为 [当前 dishId]；已打卡历史为空，不追溯。
 * drawnComboIds 缺失时从现有候选推导，保持“已抽过的不再重复”的旧行为。
 */
export function migrateV4ToV5(raw: UnknownRecord): UnknownRecord {
  if (typeof raw.schemaVersion === 'number' && raw.schemaVersion >= 5) {
    return raw
  }

  if (!isRecord(raw.days)) {
    return { ...raw, schemaVersion: 5 }
  }

  const days: UnknownRecord = {}
  for (const [dateKey, rawDay] of Object.entries(raw.days)) {
    if (!isRecord(rawDay)) {
      days[dateKey] = rawDay
      continue
    }
    const rawMeals = isRecord(rawDay.meals) ? rawDay.meals : {}
    const meals: UnknownRecord = { ...rawMeals }
    for (const meal of MEALS) {
      if (rawMeals[meal.type] !== undefined) {
        meals[meal.type] = migrateMealV5(rawMeals[meal.type])
      }
    }
    days[dateKey] = { ...rawDay, meals }
  }

  return { ...raw, schemaVersion: 5, days }
}

/**
 * v5 → v6：把印章缓存展开成追加型事件。
 * - 每个 checkInDates 项生成确定性 id 的非 synthetic 事件；
 * - checkInCount 比日期多出的部分用 synthetic 占位补齐，次数不下降；
 * - 已有合法 checkinEvents 原样保留（去重），未知字段逐层 spread 保留。
 */
export function migrateV5ToV6(raw: UnknownRecord): UnknownRecord {
  if (typeof raw.schemaVersion === 'number' && raw.schemaVersion >= 6) {
    return raw
  }

  const existing = normalizeCheckInEvents(raw.checkinEvents)
  const dishesWithEvents = new Set(existing.map((event) => event.dishId))
  const events: CheckInEvent[] = [...existing]

  if (isRecord(raw.stamps)) {
    for (const dishId of Object.keys(raw.stamps).sort()) {
      if (dishesWithEvents.has(dishId)) {
        continue
      }
      const rawStamp = raw.stamps[dishId]
      if (!isRecord(rawStamp)) {
        continue
      }

      const dates = Array.isArray(rawStamp.checkInDates)
        ? rawStamp.checkInDates.filter(
            (item): item is string => typeof item === 'string',
          )
        : []
      const storedCount =
        typeof rawStamp.checkInCount === 'number' &&
        Number.isInteger(rawStamp.checkInCount) &&
        rawStamp.checkInCount >= 0
          ? rawStamp.checkInCount
          : 0
      const firstCheckInDate =
        typeof rawStamp.firstCheckInDate === 'string'
          ? rawStamp.firstCheckInDate
          : (dates[0] ?? '')

      dates.forEach((dateKey, index) => {
        events.push({
          id: legacyCheckInEventId(dishId, dateKey, index),
          dishId,
          dateKey,
          createdAt: index,
        })
      })

      const missing = Math.max(0, storedCount - dates.length)
      for (let index = 0; index < missing; index += 1) {
        events.push({
          id: missingCheckInEventId(dishId, index),
          dishId,
          dateKey: firstCheckInDate || dates[0] || '1970-01-01',
          createdAt: 0,
          synthetic: true,
        })
      }
    }
  }

  return { ...raw, schemaVersion: 6, checkinEvents: events }
}

function migrateV1Day(rawDay: UnknownRecord, dateKey: string): UnknownRecord {
  const rawMeals = isRecord(rawDay.meals) ? rawDay.meals : {}
  const meals: UnknownRecord = {}

  for (const meal of MEALS) {
    meals[meal.type] = migrateV1Meal(rawMeals[meal.type], dateKey, meal.type)
  }

  return { ...rawDay, meals }
}

interface LegacyCustomRecord {
  name: string
  calories: number | null
}

function migrateV1Meal(
  value: unknown,
  dateKey: string,
  meal: MealType,
): UnknownRecord {
  if (!isRecord(value)) {
    return createMealRecord() as unknown as UnknownRecord
  }

  // 直接调用迁移函数时，已经是 v2 的餐记录保持原样。
  if (Array.isArray(value.candidateCombos)) {
    return value
  }

  const candidateDishIds: string[] = []
  const seen = new Set<string>()
  if (Array.isArray(value.candidateDishIds)) {
    for (const dishId of value.candidateDishIds) {
      if (
        typeof dishId === 'string' &&
        dishId.length > 0 &&
        !seen.has(dishId)
      ) {
        seen.add(dishId)
        candidateDishIds.push(dishId)
      }
    }
  }

  const selectedDishId =
    typeof value.selectedDishId === 'string' &&
    value.selectedDishId.length > 0
      ? value.selectedDishId
      : null
  if (selectedDishId && !seen.has(selectedDishId)) {
    seen.add(selectedDishId)
    candidateDishIds.push(selectedDishId)
  }

  const actualGrams = readLegacyGrams(value.actualGrams)
  const customRecord = readLegacyCustomRecord(value.customRecord)
  const budget = readLegacyBudget(value.budget, customRecord !== null)
  const oldCalories = isNonNegativeFinite(value.calories)
    ? value.calories
    : null

  const candidateCombos: ComboCandidateSnapshot[] = candidateDishIds.map(
    (dishId) =>
      createLegacyCandidate({
        dateKey,
        meal,
        dishId,
        ...(selectedDishId === dishId ? { actualGrams } : {}),
        eaten:
          customRecord === null &&
          selectedDishId === dishId &&
          budget.checkedIn,
      }),
  )

  let customCandidate: ComboCandidateSnapshot | null = null
  if (customRecord) {
    customCandidate = createLegacyCustomCandidate({
      dateKey,
      meal,
      name: customRecord.name,
      calories: customRecord.calories,
    })
    candidateCombos.push(customCandidate)
  }

  return {
    candidateCombos,
    selectedCandidateId:
      customCandidate?.id ??
      (selectedDishId
        ? `legacy:${dateKey}:${meal}:${selectedDishId}`
        : null),
    calories: customRecord ? customRecord.calories : oldCalories,
    budget,
  }
}

function readLegacyGrams(value: unknown): Record<string, number> {
  const grams: Record<string, number> = {}
  if (!isRecord(value)) {
    return grams
  }

  for (const [ingredientId, amount] of Object.entries(value)) {
    if (isNonNegativeFinite(amount)) {
      grams[ingredientId] = amount
    }
  }
  return grams
}

function readLegacyCustomRecord(value: unknown): LegacyCustomRecord | null {
  if (!isRecord(value) || typeof value.name !== 'string') {
    return null
  }

  const name = value.name.trim()
  if (name.length === 0) {
    return null
  }

  if (value.calories === null || value.calories === undefined) {
    return { name, calories: null }
  }
  if (!isNonNegativeFinite(value.calories)) {
    return null
  }
  return { name, calories: Math.round(value.calories) }
}

function readLegacyBudget(
  value: unknown,
  checkedInForCustom: boolean,
): MealDrawBudget {
  const raw = isRecord(value) ? value : {}
  return {
    baseUsed:
      typeof raw.baseUsed === 'number' &&
      Number.isInteger(raw.baseUsed) &&
      raw.baseUsed >= 0
        ? raw.baseUsed
        : 0,
    adUsed:
      typeof raw.adUsed === 'number' &&
      Number.isInteger(raw.adUsed) &&
      raw.adUsed >= 0
        ? raw.adUsed
        : 0,
    checkedIn: raw.checkedIn === true || checkedInForCustom,
  }
}

export function createDailyRecord(dateKey: string = toDateKey()): DailyRecord {
  const meals = {} as Record<MealType, MealRecord>
  for (const meal of MEALS) {
    meals[meal.type] = createMealRecord()
  }

  return {
    dateKey,
    meals,
    tokens: createTokenWallet(dateKey),
  }
}

export function createEmptyAppData(todayKey: string = toDateKey()): AppData {
  return {
    schemaVersion: APP_DATA_SCHEMA_VERSION,
    profile: null,
    targetCalories: null,
    pityCount: 0,
    days: { [todayKey]: createDailyRecord(todayKey) },
    checkinEvents: [],
    stamps: {},
    customIngredients: [],
    customDishes: [],
    settings: {
      showCalories: true,
      profileHintDismissed: false,
      theme: DEFAULT_THEME,
    },
  }
}

/** 确保当天记录存在；旧日记录保留，当天过期抽卡券归零。 */
export function ensureToday(
  data: AppData,
  todayKey: string = toDateKey(),
): AppData {
  const existing = data.days[todayKey]
  const today = existing
    ? {
        ...existing,
        dateKey: todayKey,
        tokens: normalizeTokenWallet(existing.tokens, todayKey),
      }
    : createDailyRecord(todayKey)

  return {
    ...data,
    days: {
      ...data.days,
      [todayKey]: today,
    },
  }
}

export function recordStampCheckIn(
  stamps: Record<string, StampRecord>,
  dishId: string,
  dateKey: string,
): Record<string, StampRecord> {
  const existing = stamps[dishId]

  if (!existing) {
    return {
      ...stamps,
      [dishId]: {
        checkInCount: 1,
        firstCheckInDate: dateKey,
        checkInDates: [dateKey],
      },
    }
  }

  return {
    ...stamps,
    [dishId]: {
      ...existing,
      checkInCount: existing.checkInCount + 1,
      checkInDates: [...existing.checkInDates, dateKey],
    },
  }
}

export function serializeAppData(data: AppData): string {
  return JSON.stringify(data, null, 2)
}

export function migrateAppData(
  raw: unknown,
  migrations: Record<number, AppDataMigration> = APP_DATA_MIGRATIONS,
): UnknownRecord {
  if (!isRecord(raw)) {
    throw new TypeError('应用数据必须是对象')
  }

  const version = raw.schemaVersion
  if (
    typeof version !== 'number' ||
    !Number.isInteger(version) ||
    version < 1
  ) {
    throw new Error('应用数据缺少有效的 schemaVersion')
  }

  if (version > APP_DATA_SCHEMA_VERSION) {
    throw new Error(
      `应用数据版本 ${version} 高于当前支持的版本 ${APP_DATA_SCHEMA_VERSION}`,
    )
  }

  let migrated = raw
  for (let from = version; from < APP_DATA_SCHEMA_VERSION; from += 1) {
    const targetVersion = from + 1
    const migration = migrations[targetVersion]
    if (!migration) {
      throw new Error(`缺少从 v${from} 到 v${targetVersion} 的迁移`)
    }
    migrated = migration(migrated)
  }

  return migrated
}

export function normalizeAppData(
  raw: unknown,
  todayKey: string = toDateKey(),
  migrations: Record<number, AppDataMigration> = APP_DATA_MIGRATIONS,
): AppData {
  const source = migrateAppData(raw, migrations)
  const profile = normalizeProfile(source.profile)
  const targetCalories = profile
    ? calcTargetCalories(profile)
    : normalizeStandaloneTarget(source.targetCalories)
  const pityCount = normalizeNonNegativeInteger(source.pityCount, 'pityCount')

  // 先补事件再重建缓存：旧缓存里多出的次数会变成确定性事件，
  // 保证归一化只增不减，且二次执行不再追加。
  const cachedStamps = normalizeStamps(source.stamps)
  const checkinEvents = reconcileEventsWithStamps(
    normalizeCheckInEvents(source.checkinEvents),
    cachedStamps,
  )
  const stamps = deriveStampsFromEvents(checkinEvents, cachedStamps)

  const data: AppData = {
    schemaVersion: APP_DATA_SCHEMA_VERSION,
    profile,
    targetCalories,
    pityCount,
    days: normalizeDays(source.days),
    checkinEvents,
    stamps,
    customIngredients: normalizeCustomIngredients(source.customIngredients),
    customDishes: normalizeCustomDishes(source.customDishes),
    settings: normalizeSettings(source.settings, profile),
  }

  return ensureToday(data, todayKey)
}

export function parseAppDataJson(
  json: string,
  todayKey: string = toDateKey(),
): AppData {
  let raw: unknown
  try {
    raw = JSON.parse(json) as unknown
  } catch {
    throw new Error('导入失败：不是合法的 JSON')
  }

  return normalizeAppData(raw, todayKey)
}

export type LoadAppDataStatus =
  | 'new'
  | 'ok'
  | 'migrated'
  | 'future'
  | 'corrupt'
  | 'migration-failed'
  | 'unavailable'

export interface LoadAppDataResult {
  status: LoadAppDataStatus
  data: AppData
  raw: string | null
  sourceVersion: number | null
  error: string | null
  snapshotId: string | null
}

export interface LoadAppDataOptions {
  snapshots?: SnapshotService
  migrations?: Record<number, AppDataMigration>
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function backupCorruptRaw(
  adapter: StorageAdapter,
  raw: string,
): Promise<void> {
  try {
    // 保存原始字符串，而不是重新 JSON.stringify 后可能丢失细节的对象。
    await adapter.setRaw(APP_DATA_CORRUPT_BACKUP_KEY, raw)
  } catch {
    // 备份失败也不能覆盖主键；原始值仍在 app-data 里。
  }
}

async function recoverableResult(
  adapter: StorageAdapter,
  snapshots: SnapshotService | undefined,
  raw: string,
  sourceVersion: number | null,
  error: string,
  todayKey: string,
): Promise<LoadAppDataResult> {
  await backupCorruptRaw(adapter, raw)

  let snapshotId: string | null = null
  if (snapshots) {
    try {
      const snapshot = await snapshots.capture({
        reason: 'before-recovery',
        data: null,
        raw,
      })
      snapshotId = snapshot.id
    } catch {
      // 恢复界面仍然可以下载原始 raw；快照失败不阻止进入恢复模式。
    }
  }

  return {
    status: 'corrupt',
    data: createEmptyAppData(todayKey),
    raw,
    sourceVersion,
    error,
    snapshotId,
  }
}

/**
 * 先读原始字符串，再决定是否写盘。只有“全新用户”和“迁移成功”两条路径会写
 * app-data；正常 v2 数据、坏数据、未来版本都不会被默认值覆盖。
 */
export async function loadAppData(
  adapter: StorageAdapter,
  todayKey: string = toDateKey(),
  options: LoadAppDataOptions = {},
): Promise<LoadAppDataResult> {
  let rawText: string | null
  try {
    rawText = await adapter.getRaw(APP_DATA_STORAGE_KEY)
  } catch (error) {
    return {
      status: 'unavailable',
      data: createEmptyAppData(todayKey),
      raw: null,
      sourceVersion: null,
      error: errorText(error),
      snapshotId: null,
    }
  }

  if (rawText === null) {
    return {
      status: 'new',
      data: createEmptyAppData(todayKey),
      raw: null,
      sourceVersion: null,
      error: null,
      snapshotId: null,
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawText) as unknown
  } catch {
    return recoverableResult(
      adapter,
      options.snapshots,
      rawText,
      null,
      '应用数据不是合法的 JSON',
      todayKey,
    )
  }

  if (!isRecord(parsed)) {
    return recoverableResult(
      adapter,
      options.snapshots,
      rawText,
      null,
      '应用数据必须是对象',
      todayKey,
    )
  }

  const version = parsed.schemaVersion
  if (
    typeof version !== 'number' ||
    !Number.isInteger(version) ||
    version < 1
  ) {
    return recoverableResult(
      adapter,
      options.snapshots,
      rawText,
      null,
      '应用数据缺少有效的 schemaVersion',
      todayKey,
    )
  }

  if (version > APP_DATA_SCHEMA_VERSION) {
    // 未来版本必须拒绝启动，避免旧版本把新数据写坏。
    return {
      status: 'future',
      data: createEmptyAppData(todayKey),
      raw: rawText,
      sourceVersion: version,
      error: `应用数据版本 ${version} 高于当前支持的版本 ${APP_DATA_SCHEMA_VERSION}，请升级应用`,
      snapshotId: null,
    }
  }

  if (version < APP_DATA_SCHEMA_VERSION) {
    if (!options.snapshots) {
      return {
        status: 'migration-failed',
        data: createEmptyAppData(todayKey),
        raw: rawText,
        sourceVersion: version,
        error: '没有可用的本地快照服务，已停止升级以保护原数据',
        snapshotId: null,
      }
    }

    let snapshotId: string
    try {
      const snapshot = await options.snapshots.capture({
        reason: 'migration',
        data: null,
        raw: rawText,
      })
      snapshotId = snapshot.id
    } catch (error) {
      return {
        status: 'migration-failed',
        data: createEmptyAppData(todayKey),
        raw: rawText,
        sourceVersion: version,
        error: `升级前快照失败，已停止升级：${errorText(error)}`,
        snapshotId: null,
      }
    }

    let migrated: AppData
    try {
      migrated = normalizeAppData(parsed, todayKey, options.migrations)
    } catch (error) {
      await backupCorruptRaw(adapter, rawText)
      return {
        status: 'migration-failed',
        data: createEmptyAppData(todayKey),
        raw: rawText,
        sourceVersion: version,
        error: `数据升级失败：${errorText(error)}`,
        snapshotId,
      }
    }

    const nextRaw = serializeAppData(migrated)
    try {
      await adapter.setRaw(APP_DATA_STORAGE_KEY, nextRaw)
      // localStorage 只写一个 key，写后读回可避免把“看似成功”的半迁移留在盘上。
      const readBack = await adapter.getRaw(APP_DATA_STORAGE_KEY)
      if (readBack !== nextRaw) {
        throw new Error('写入后读回校验不一致')
      }
    } catch (error) {
      try {
        await adapter.setRaw(APP_DATA_STORAGE_KEY, rawText)
      } catch {
        // 回滚失败时原始值仍在快照里；恢复界面会提供下载/恢复。
      }
      return {
        status: 'migration-failed',
        data: createEmptyAppData(todayKey),
        raw: rawText,
        sourceVersion: version,
        error: `数据升级写入失败：${errorText(error)}`,
        snapshotId,
      }
    }

    return {
      status: 'migrated',
      data: migrated,
      raw: nextRaw,
      sourceVersion: version,
      error: null,
      snapshotId,
    }
  }

  try {
    return {
      status: 'ok',
      data: normalizeAppData(parsed, todayKey, options.migrations),
      raw: rawText,
      sourceVersion: version,
      error: null,
      snapshotId: null,
    }
  } catch (error) {
    return recoverableResult(
      adapter,
      options.snapshots,
      rawText,
      version,
      `应用数据结构损坏：${errorText(error)}`,
      todayKey,
    )
  }
}

export async function saveAppData(
  adapter: StorageAdapter,
  data: AppData,
): Promise<void> {
  await adapter.set(APP_DATA_STORAGE_KEY, data)
}

/**
 * 清空全部业务数据。
 * 写空数据而不是 remove：即使中途失败，存储里也不会留下半本旧记录。
 * 不删除 corrupt-backup：它可能是用户找回旧数据的最后一份原文。
 */
export async function clearAppData(
  adapter: StorageAdapter,
  todayKey: string = toDateKey(),
): Promise<void> {
  await saveAppData(adapter, createEmptyAppData(todayKey))
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function normalizeNonNegativeInteger(
  value: unknown,
  label: string,
): number {
  if (value === undefined) {
    return 0
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new TypeError(`${label}必须是非负整数`)
  }
  return value
}

function isSex(value: unknown): value is Sex {
  return value === 'female' || value === 'male'
}

function isActivityLevel(value: unknown): value is ActivityLevel {
  return (
    typeof value === 'string' &&
    ACTIVITY_LEVELS.some((item) => item.level === value)
  )
}

function isCalorieGoal(value: unknown): value is CalorieGoal {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(GOAL_ADJUSTMENTS, value)
  )
}

function normalizeProfile(value: unknown): BodyProfile | null {
  if (value === null || value === undefined) {
    return null
  }
  if (!isRecord(value)) {
    throw new TypeError('profile 必须是对象')
  }

  const { sex, age, heightCm, weightKg, activity, goal } = value
  if (!isSex(sex)) {
    throw new TypeError('profile.sex 无效')
  }
  if (!isActivityLevel(activity)) {
    throw new TypeError('profile.activity 无效')
  }
  if (!isCalorieGoal(goal)) {
    throw new TypeError('profile.goal 无效')
  }
  if (!isPositiveFinite(age)) {
    throw new TypeError('profile.age 必须是正数')
  }
  if (!isPositiveFinite(heightCm)) {
    throw new TypeError('profile.heightCm 必须是正数')
  }
  if (!isPositiveFinite(weightKg)) {
    throw new TypeError('profile.weightKg 必须是正数')
  }

  const profile: BodyProfile = {
    sex,
    age,
    heightCm,
    weightKg,
    activity,
    goal,
  }

  const manual = value.manualTargetKcal
  if (manual !== undefined && manual !== null) {
    if (!isPositiveFinite(manual)) {
      throw new TypeError('profile.manualTargetKcal 必须是正数')
    }
    profile.manualTargetKcal = manual
  }

  return profile
}

function normalizeStandaloneTarget(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null
  }
  if (!isPositiveFinite(value)) {
    throw new TypeError('targetCalories 必须是正数或 null')
  }
  return Math.round(value)
}

function normalizeDays(value: unknown): Record<string, DailyRecord> {
  if (value === undefined) {
    return {}
  }
  if (!isRecord(value)) {
    throw new TypeError('days 必须是对象')
  }

  const days: Record<string, DailyRecord> = {}
  for (const [dateKey, rawDay] of Object.entries(value)) {
    if (!isValidDateKey(dateKey)) {
      throw new TypeError(`无效的日期键: ${dateKey}`)
    }
    if (!isRecord(rawDay)) {
      throw new TypeError(`日期 ${dateKey} 的记录必须是对象`)
    }
    days[dateKey] = normalizeDailyRecord(rawDay, dateKey)
  }

  return days
}

function normalizeDailyRecord(raw: UnknownRecord, dateKey: string): DailyRecord {
  const rawMeals = isRecord(raw.meals) ? raw.meals : {}
  const meals = {} as Record<MealType, MealRecord>
  for (const meal of MEALS) {
    meals[meal.type] = normalizeMealRecord(rawMeals[meal.type])
  }

  return {
    dateKey,
    meals,
    tokens: normalizeWallet(raw.tokens, dateKey),
  }
}

function normalizeMealRecord(value: unknown): MealRecord {
  if (!isRecord(value)) {
    return createMealRecord()
  }

  const candidateCombos: ComboCandidateSnapshot[] = []
  const seen = new Set<string>()
  if (Array.isArray(value.candidateCombos)) {
    for (const raw of value.candidateCombos) {
      const candidate = normalizeComboCandidate(raw)
      if (candidate && !seen.has(candidate.id)) {
        seen.add(candidate.id)
        candidateCombos.push(candidate)
      }
    }
  }

  const selectedCandidateId =
    typeof value.selectedCandidateId === 'string' &&
    seen.has(value.selectedCandidateId)
      ? value.selectedCandidateId
      : null

  const normalizedDrawn = Array.isArray(value.drawnComboIds)
    ? [
        ...new Set(
          value.drawnComboIds.filter(
            (id): id is string => typeof id === 'string' && id.length > 0,
          ),
        ),
      ]
    : null
  const drawnComboIds =
    normalizedDrawn ??
    [
      ...new Set(
        candidateCombos.flatMap((candidate) =>
          candidate.comboId ? [candidate.comboId] : [],
        ),
      ),
    ]

  return {
    candidateCombos,
    selectedCandidateId,
    calories: isNonNegativeFinite(value.calories) ? value.calories : null,
    budget: normalizeBudget(value.budget),
    drawnComboIds,
  }
}

function isRarity(value: unknown): value is Rarity {
  return (
    typeof value === 'string' &&
    RARITY_ORDER.some((rarity) => rarity === value)
  )
}

function isComponentKind(value: unknown): value is ComponentKind {
  return value === 'dish' || value === 'custom'
}

function isComponentOrigin(value: unknown): value is ComponentOrigin {
  return (
    value === 'combo' ||
    value === 'redraw' ||
    value === 'manual' ||
    value === 'custom'
  )
}

function isComboSource(value: unknown): value is ComboSource {
  return value === 'draw' || value === 'legacy' || value === 'customRecord'
}

function isDishCategoryValue(value: unknown): value is DishCategory {
  return typeof value === 'string' && isDishCategory(value)
}

function fallbackNameFromComponents(
  components: readonly MealComponentSnapshot[],
): string | null {
  const names = components
    .filter((component) => !component.discarded && component.name.trim().length > 0)
    .map((component) => component.name.trim())
  if (names.length === 0) {
    return null
  }
  return truncateName(names.slice(0, 2).join('和'))
}

function normalizeComboCandidate(
  value: unknown,
): ComboCandidateSnapshot | null {
  if (!isRecord(value)) {
    return null
  }

  const id = typeof value.id === 'string' && value.id.length > 0 ? value.id : null
  if (
    !id ||
    !isRarity(value.rarity) ||
    !isComboSource(value.source) ||
    !Array.isArray(value.components)
  ) {
    return null
  }

  const components: MealComponentSnapshot[] = []
  const seen = new Set<string>()
  for (const raw of value.components) {
    const component = normalizeComponent(raw)
    if (component && !seen.has(component.id)) {
      seen.add(component.id)
      components.push(component)
    }
  }
  if (components.length === 0) {
    return null
  }

  const comboId = typeof value.comboId === 'string' ? value.comboId : null
  const manualName = nonEmptyText(value.manualName)
  const nameSource: ComboNameSource = isComboNameSource(value.nameSource)
    ? value.nameSource
    : manualName
      ? 'manual'
      : 'legacy'
  const name =
    nonEmptyText(value.name) ??
    nonEmptyText(value.baseName) ??
    (comboId ? LEGACY_COMBO_NAMES[comboId] : undefined) ??
    fallbackNameFromComponents(components) ??
    '旧套餐'
  const combo = comboId ? comboById.get(comboId) : undefined
  let baseDishIds: string[]
  if (
    Array.isArray(value.baseDishIds) &&
    value.baseDishIds.every((dishId) => typeof dishId === 'string')
  ) {
    baseDishIds = [...value.baseDishIds]
  } else if (combo) {
    baseDishIds = [...combo.components]
  } else {
    baseDishIds = components.flatMap((component) =>
      !component.discarded &&
      component.kind === 'dish' &&
      component.dishId
        ? [component.dishId]
        : [],
    )
  }
  const finalManual = manualName ?? (nameSource === 'manual' ? name : null)

  return {
    id,
    comboId,
    source: value.source,
    name,
    nameSource,
    ...(finalManual ? { manualName: finalManual } : {}),
    baseName: nonEmptyText(value.baseName) ?? name,
    baseDishIds,
    rarity: value.rarity,
    ...(typeof value.tip === 'string' ? { tip: value.tip } : {}),
    components,
  }
}

function normalizeSeenDishIds(
  value: unknown,
  fallback: readonly string[],
): string[] {
  if (!Array.isArray(value)) {
    return [...fallback]
  }
  return [
    ...new Set(
      value.filter(
        (id): id is string => typeof id === 'string' && id.length > 0,
      ),
    ),
  ]
}

function normalizeComponent(value: unknown): MealComponentSnapshot | null {
  if (!isRecord(value)) {
    return null
  }

  const id = typeof value.id === 'string' && value.id.length > 0 ? value.id : null
  const name =
    typeof value.name === 'string' && value.name.length > 0
      ? value.name
      : null
  if (
    !id ||
    !name ||
    !isComponentKind(value.kind) ||
    !isComponentOrigin(value.origin) ||
    !isRarity(value.rarity)
  ) {
    return null
  }

  if (value.kind === 'custom') {
    return {
      id,
      kind: 'custom',
      origin: value.origin,
      dishId: null,
      name,
      category: null,
      rarity: value.rarity,
      image: null,
      cooking: null,
      ingredients: [],
      grams: null,
      calories: isNonNegativeFinite(value.calories) ? value.calories : null,
      eaten: typeof value.eaten === 'boolean' ? value.eaten : true,
      discarded: value.discarded === true,
      seenDishIds: normalizeSeenDishIds(value.seenDishIds, []),
    }
  }

  const dishId =
    typeof value.dishId === 'string' && value.dishId.length > 0
      ? value.dishId
      : null
  if (!dishId) {
    return null
  }

  const ingredients: ComponentIngredientSnapshot[] = []
  if (Array.isArray(value.ingredients)) {
    for (const raw of value.ingredients) {
      if (!isRecord(raw)) {
        continue
      }
      const ingredientName =
        typeof raw.name === 'string' && raw.name.length > 0
          ? raw.name
          : null
      if (
        !ingredientName ||
        !isNonNegativeFinite(raw.kcalPer100g) ||
        !isNonNegativeFinite(raw.grams)
      ) {
        continue
      }
      ingredients.push({
        ...(typeof raw.ingredientId === 'string'
          ? { ingredientId: raw.ingredientId }
          : {}),
        name: ingredientName,
        kcalPer100g: raw.kcalPer100g,
        grams: raw.grams,
      })
    }
  }

  return {
    id,
    kind: 'dish',
    origin: value.origin,
    dishId,
    name,
    category: isDishCategoryValue(value.category) ? value.category : null,
    rarity: value.rarity,
    image: typeof value.image === 'string' ? value.image : null,
    ...(typeof value.imageId === 'string' && value.imageId.length > 0
      ? { imageId: value.imageId }
      : {}),
    ...(typeof value.emoji === 'string' && value.emoji.trim().length > 0
      ? { emoji: value.emoji.trim().slice(0, 16) }
      : {}),
    ...(typeof value.stampImage === 'string'
      ? { stampImage: value.stampImage }
      : {}),
    ...(typeof value.tip === 'string' ? { tip: value.tip } : {}),
    cooking: normalizeCooking(value.cooking),
    ingredients,
    grams: isNonNegativeFinite(value.grams) ? value.grams : null,
    calories: isNonNegativeFinite(value.calories) ? value.calories : null,
    eaten: typeof value.eaten === 'boolean' ? value.eaten : true,
    discarded: value.discarded === true,
    seenDishIds: normalizeSeenDishIds(value.seenDishIds, [dishId]),
  }
}

function normalizeCooking(value: unknown): CookingInfo | null {
  if (!isRecord(value) || typeof value.method !== 'string') {
    return null
  }
  if (!isCookingMethod(value.method)) {
    return null
  }
  if (!isNonNegativeFinite(value.timeMinutes)) {
    return null
  }
  if (
    !Array.isArray(value.steps) ||
    value.steps.some((step) => typeof step !== 'string')
  ) {
    return null
  }

  return {
    method: value.method,
    timeMinutes: value.timeMinutes,
    steps: [...value.steps],
    ...(typeof value.tips === 'string' ? { tips: value.tips } : {}),
  }
}

function normalizeSettings(
  value: unknown,
  profile: BodyProfile | null,
): AppSettings {
  const raw = isRecord(value) ? value : {}
  const hasProfile = profile !== null

  return {
    // 展示开关与档案无关；缺字段的旧数据默认开启。
    showCalories:
      typeof raw.showCalories === 'boolean' ? raw.showCalories : true,
    // 老用户有档案时默认不再提示；显式值（包括 false）优先保留。
    profileHintDismissed:
      typeof raw.profileHintDismissed === 'boolean'
        ? raw.profileHintDismissed
        : hasProfile,
    // v3 已声明 theme；缺失/非法值回退默认主题，合法值原样保留。
    theme: isThemeName(raw.theme) ? raw.theme : DEFAULT_THEME,
  }
}

function normalizeBudget(value: unknown): MealDrawBudget {
  if (!isRecord(value)) {
    return createMealDrawBudget()
  }

  return {
    baseUsed:
      typeof value.baseUsed === 'number' &&
      Number.isInteger(value.baseUsed) &&
      value.baseUsed >= 0
        ? value.baseUsed
        : 0,
    adUsed:
      typeof value.adUsed === 'number' &&
      Number.isInteger(value.adUsed) &&
      value.adUsed >= 0
        ? value.adUsed
        : 0,
    checkedIn: value.checkedIn === true,
  }
}

function normalizeStamps(value: unknown): Record<string, StampRecord> {
  if (value === undefined) {
    return {}
  }
  if (!isRecord(value)) {
    throw new TypeError('stamps 必须是对象')
  }

  const stamps: Record<string, StampRecord> = {}
  for (const [dishId, rawStamp] of Object.entries(value)) {
    if (!isRecord(rawStamp)) {
      throw new TypeError(`印章 ${dishId} 的记录必须是对象`)
    }

    const checkInDates = Array.isArray(rawStamp.checkInDates)
      ? rawStamp.checkInDates.filter(
          (item): item is string => typeof item === 'string',
        )
      : []
    const storedCount =
      typeof rawStamp.checkInCount === 'number' &&
      Number.isInteger(rawStamp.checkInCount) &&
      rawStamp.checkInCount >= 0
        ? rawStamp.checkInCount
        : 0
    const firstCheckInDate =
      typeof rawStamp.firstCheckInDate === 'string'
        ? rawStamp.firstCheckInDate
        : (checkInDates[0] ?? '')

    stamps[dishId] = {
      checkInCount: Math.max(storedCount, checkInDates.length),
      firstCheckInDate,
      checkInDates,
    }
  }

  return stamps
}

function normalizeCustomIngredients(value: unknown): CustomIngredient[] {
  if (value === undefined) {
    return []
  }
  if (!Array.isArray(value)) {
    throw new TypeError('customIngredients 必须是数组')
  }

  const ingredients: CustomIngredient[] = []
  const seen = new Set<string>()
  for (const raw of value) {
    if (!isRecord(raw)) {
      continue
    }
    const id = typeof raw.id === 'string' ? raw.id.trim() : ''
    const name = typeof raw.name === 'string' ? raw.name.trim() : ''
    if (
      !id ||
      !name ||
      seen.has(id) ||
      !isNonNegativeFinite(raw.kcalPer100g)
    ) {
      continue
    }
    seen.add(id)
    ingredients.push({ id, name, kcalPer100g: raw.kcalPer100g })
  }

  return ingredients
}

/** 归一化自建菜谱；非法项静默丢弃，不要让整份存档启动失败。 */
function normalizeCustomDishes(value: unknown): CustomDish[] {
  if (value === undefined) {
    return []
  }
  if (!Array.isArray(value)) {
    throw new TypeError('customDishes 必须是数组')
  }

  const dishes: CustomDish[] = []
  const seen = new Set<string>()
  for (const raw of value) {
    const dish = normalizeCustomDish(raw)
    if (dish && !seen.has(dish.id)) {
      seen.add(dish.id)
      dishes.push(dish)
    }
  }

  return dishes
}

function normalizeCustomDish(value: unknown): CustomDish | null {
  if (!isRecord(value)) {
    return null
  }

  const id = typeof value.id === 'string' ? value.id.trim() : ''
  const name = typeof value.name === 'string' ? value.name.trim() : ''
  if (!id || !name || !isDishCategoryValue(value.category)) {
    return null
  }

  const meals = normalizeMealTypes(value.meals)
  if (meals.length === 0) {
    return null
  }

  const rarity =
    isRarity(value.rarity) &&
    customDishAllowedRarities.some((allowed) => allowed === value.rarity)
      ? value.rarity
      : customDishAllowedRarities[0]

  const totalCalories = isPositiveFinite(value.calories)
    ? Math.round(value.calories)
    : null
  const calorieMode: CalorieMode =
    value.calorieMode === 'total' && totalCalories !== null
      ? 'total'
      : 'ingredients'
  const archived = value.archived === true

  return {
    id,
    name,
    imageId:
      typeof value.imageId === 'string' && value.imageId.trim().length > 0
        ? value.imageId
        : null,
    emoji:
      typeof value.emoji === 'string' && value.emoji.trim().length > 0
        ? value.emoji
        : null,
    category: value.category,
    meals,
    rarity,
    ingredientRows: normalizeIngredientRows(value.ingredientRows),
    calorieMode,
    calories: calorieMode === 'total' ? totalCalories : null,
    cooking: normalizeDishCooking(value.cooking),
    // 归档菜不再抽到；开关状态保留与否都不影响这个不变量。
    includeInPool: !archived && value.includeInPool !== false,
    archived,
    createdAt:
      typeof value.createdAt === 'string' && isValidDateKey(value.createdAt)
        ? value.createdAt
        : '',
  }
}

function normalizeIngredientRows(value: unknown): CustomDishIngredientRow[] {
  if (!Array.isArray(value)) {
    return []
  }

  const rows: CustomDishIngredientRow[] = []
  for (const raw of value) {
    if (!isRecord(raw)) {
      continue
    }
    const name = typeof raw.name === 'string' ? raw.name.trim() : ''
    if (!name || !isNonNegativeFinite(raw.kcalPer100g) || !isPositiveFinite(raw.grams)) {
      continue
    }
    rows.push({
      ...(typeof raw.ingredientId === 'string' && raw.ingredientId.length > 0
        ? { ingredientId: raw.ingredientId }
        : {}),
      name,
      kcalPer100g: raw.kcalPer100g,
      grams: raw.grams,
    })
  }

  return rows
}

function normalizeMealTypes(value: unknown): MealType[] {
  if (!Array.isArray(value)) {
    return []
  }

  const meals: MealType[] = []
  for (const raw of value) {
    if (typeof raw === 'string' && isMealType(raw) && !meals.includes(raw)) {
      meals.push(raw)
    }
  }

  return meals
}

/** 自制菜的做法遵守表单约束：3~5 步、每步 ≤30 字、时间 ≤300 分钟。 */
function normalizeDishCooking(value: unknown): CookingInfo | null {
  const cooking = normalizeCooking(value)
  if (!cooking) {
    return null
  }
  if (
    cooking.steps.length < COOKING_STEP_MIN ||
    cooking.steps.length > COOKING_STEP_MAX ||
    cooking.timeMinutes > COOKING_TIME_MAX_MINUTES ||
    cooking.steps.some(
      (step) =>
        step.trim().length === 0 ||
        countUnicodeChars(step) > COOKING_STEP_MAX_CHARS,
    )
  ) {
    return null
  }

  return cooking
}

function normalizeWallet(value: unknown, dateKey: string): TokenWallet {
  if (!isRecord(value)) {
    return createTokenWallet(dateKey)
  }

  return normalizeTokenWallet(
    {
      dateKey: typeof value.dateKey === 'string' ? value.dateKey : dateKey,
      count: typeof value.count === 'number' ? value.count : 0,
      customRewardClaimed: value.customRewardClaimed === true,
    },
    dateKey,
  )
}

function isValidDateKey(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) {
    return false
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}
