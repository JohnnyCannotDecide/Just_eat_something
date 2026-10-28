import {
  ACTIVITY_LEVELS,
  GOAL_ADJUSTMENTS,
  MEALS,
  RARITY_ORDER,
  customDishAllowedRarities,
} from '@/config/gameConfig'
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

import type { StorageAdapter } from './StorageAdapter'

export const APP_DATA_SCHEMA_VERSION = 2
export const APP_DATA_STORAGE_KEY = 'app-data'
/** 结构损坏但仍是合法 JSON 时，原始值会先备份到这里再以空数据启动。 */
export const APP_DATA_CORRUPT_BACKUP_KEY = 'app-data:corrupt-backup'

export interface AppSettings {
  showCalories: boolean
  /** 今日页游客提示是否已被用户关闭。 */
  profileHintDismissed: boolean
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
  /** dishId → 印章收藏。 */
  stamps: Record<string, StampRecord>
  /** 用户自建的食材。 */
  customIngredients: CustomIngredient[]
  /** 用户自建的菜谱；图片本身存在 IndexedDB。 */
  customDishes: CustomDish[]
  /** 展示偏好；老数据缺失时由 normalize 补齐。 */
  settings: AppSettings
}

type UnknownRecord = Record<string, unknown>
type Migration = (data: UnknownRecord) => UnknownRecord

/** 迁移链：目标版本 → 从上一版升级到该版本的纯函数。 */
const APP_DATA_MIGRATIONS: Record<number, Migration> = {
  2: migrateV1ToV2,
}

export function createMealRecord(): MealRecord {
  return {
    candidateCombos: [],
    selectedCandidateId: null,
    calories: null,
    budget: createMealDrawBudget(),
  }
}

/** v1 单菜记录 → v2 单部件临时套餐；纯函数且可重复调用。 */
export function migrateV1ToV2(raw: UnknownRecord): UnknownRecord {
  if (raw.schemaVersion === 2) {
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
    stamps: {},
    customIngredients: [],
    customDishes: [],
    settings: {
      showCalories: false,
      profileHintDismissed: false,
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

export function migrateAppData(raw: unknown): UnknownRecord {
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
    const migration = APP_DATA_MIGRATIONS[targetVersion]
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
): AppData {
  const source = migrateAppData(raw)
  const profile = normalizeProfile(source.profile)
  const targetCalories = profile
    ? calcTargetCalories(profile)
    : normalizeStandaloneTarget(source.targetCalories)
  const pityCount = normalizeNonNegativeInteger(source.pityCount, 'pityCount')

  const data: AppData = {
    schemaVersion: APP_DATA_SCHEMA_VERSION,
    profile,
    targetCalories,
    pityCount,
    days: normalizeDays(source.days),
    stamps: normalizeStamps(source.stamps),
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

export async function loadAppData(
  adapter: StorageAdapter,
  todayKey: string = toDateKey(),
): Promise<AppData> {
  const raw = await adapter.get<unknown>(APP_DATA_STORAGE_KEY)
  if (raw === null || raw === undefined) {
    return createEmptyAppData(todayKey)
  }

  try {
    return normalizeAppData(raw, todayKey)
  } catch (error) {
    // 未来版本的 schema 必须拒绝启动，避免旧版本覆盖新数据。
    if (isFutureSchema(raw)) {
      throw error
    }

    // 合法 JSON 但结构坏了：先留一份原始备份，再以空数据自愈。
    await backupCorruptData(adapter, raw)
    return createEmptyAppData(todayKey)
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
 */
export async function clearAppData(
  adapter: StorageAdapter,
  todayKey: string = toDateKey(),
): Promise<void> {
  await saveAppData(adapter, createEmptyAppData(todayKey))
  try {
    await adapter.remove(APP_DATA_CORRUPT_BACKUP_KEY)
  } catch {
    // 备份清理只是顺手的事，失败不该阻止清空主数据。
  }
}

function isFutureSchema(raw: unknown): boolean {
  if (!isRecord(raw)) {
    return false
  }
  const version = raw.schemaVersion
  return (
    typeof version === 'number' &&
    Number.isInteger(version) &&
    version > APP_DATA_SCHEMA_VERSION
  )
}

async function backupCorruptData(
  adapter: StorageAdapter,
  raw: unknown,
): Promise<void> {
  try {
    await adapter.set(APP_DATA_CORRUPT_BACKUP_KEY, raw)
  } catch {
    // 备份失败也要让用户能启动，原始值由适配器的存储键保留。
  }
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

  return {
    candidateCombos,
    selectedCandidateId,
    calories: isNonNegativeFinite(value.calories) ? value.calories : null,
    budget: normalizeBudget(value.budget),
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

function normalizeComboCandidate(
  value: unknown,
): ComboCandidateSnapshot | null {
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

  return {
    id,
    comboId: typeof value.comboId === 'string' ? value.comboId : null,
    source: value.source,
    name,
    rarity: value.rarity,
    ...(typeof value.tip === 'string' ? { tip: value.tip } : {}),
    components,
  }
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
    // 没有档案时无法计算目标，开关必须保持关闭。
    showCalories:
      hasProfile &&
      (typeof raw.showCalories === 'boolean' ? raw.showCalories : true),
    // 老用户有档案时默认不再提示；显式值（包括 false）优先保留。
    profileHintDismissed:
      typeof raw.profileHintDismissed === 'boolean'
        ? raw.profileHintDismissed
        : hasProfile,
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
