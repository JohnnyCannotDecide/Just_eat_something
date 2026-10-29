import { create } from 'zustand'

import {
  customDishAllowedRarities,
} from '@/config/gameConfig'
import type { ThemeName } from '@/config/gameConfig'
import { toDateKey } from '@/core/dateKey'
import {
  addCustomComponent,
  addDishComponent,
  createCandidateInstanceId,
  createComboCandidate,
  createCustomOnlyCandidate,
  discardComponent,
  replaceComponent as replaceComponentSnapshot,
  restoreComponent,
  withComponentEaten,
  withComponentIngredientGrams,
  withCustomComponentCalories,
} from '@/core/components'
import {
  refreshComboName,
  withAutoComboName,
  withManualComboName,
} from '@/core/comboName'
import {
  buildDishLibrary,
  createCustomDishId,
  createCustomIngredientId,
  createImageId,
  hasAnySnapshotReference,
  hasCheckInRecords,
} from '@/core/customDish'
import type { Rng } from '@/core/draw'
import { getDrawAllowance } from '@/core/drawBudget'
import type { DrawSource } from '@/core/drawBudget'
import {
  checkInMeal as coreCheckInMeal,
  drawForMeal,
  redrawComponent as coreRedrawComponent,
} from '@/core/gameFlow'
import type { DrawBlockedReason } from '@/core/gameFlow'
import { getStampTier, getStampUpgrade } from '@/core/stamps'
import { calcTargetCalories } from '@/core/targetCalories'
import { isTokenValid } from '@/core/tokens'
import type {
  BodyProfile,
  CalorieMode,
  ComboCandidateSnapshot,
  CookingInfo,
  CustomDish,
  CustomDishIngredientRow,
  CustomIngredient,
  DishCategory,
  MealComponentSnapshot,
  MealType,
  Rarity,
  StampDishSnapshot,
  StampTier,
} from '@/core/types'
import { countUnicodeChars, isDishCategory, isMealType } from '@/data/dataRules'
import { snapshotService, storage } from '@/storage'
import {
  APP_DATA_SCHEMA_VERSION,
  APP_DATA_STORAGE_KEY,
  clearAppData,
  createEmptyAppData,
  ensureToday,
  loadAppData,
  parseAppDataJson,
  recordStampCheckIn,
  saveAppData,
} from '@/storage/appData'
import type { AppData, DailyRecord, MealRecord } from '@/storage/appData'
import type {
  BinaryStorageAdapter,
  ImageMime,
  StoredImage,
  StoredImageEntry,
} from '@/storage/BinaryStorageAdapter'
import { dataTransferLockName } from '@/storage/namespaces'
import type { StorageNamespace } from '@/storage/namespaces'
import type { SnapshotMeta, SnapshotReason } from '@/storage/SnapshotStore'
import type { SnapshotService } from '@/storage/snapshots'
import type { StorageAdapter } from '@/storage/StorageAdapter'
import {
  PENDING_IMPORT_KEY,
  buildBackup,
  collectReferencedImageIds,
  parseBackupJson,
  serializeBackup,
} from '@/storage/backup'

export type AppStoreStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'error'
  | 'recovery'

export type RecoveryReason = 'corrupt' | 'migration-failed' | 'future'

export interface RecoveryState {
  reason: RecoveryReason
  message: string
  raw: string | null
  sourceVersion: number | null
  snapshotId: string | null
}

export interface DrawReceipt {
  meal: MealType
  candidate: ComboCandidateSnapshot
  source: DrawSource
  pityTriggered: boolean
  tokenCount: number
  pityCount: number
  shuffled: boolean
  singleCandidate: boolean
}

export type DrawActionResult =
  | { status: 'drawn'; receipt: DrawReceipt }
  | { status: 'ad-required' }
  | { status: 'ad-cancelled' }
  | { status: 'stale'; message: string }
  | { status: 'blocked'; reason: DrawBlockedReason }
  | { status: 'error'; message: string }

export interface CheckInStampReceipt {
  dish: StampDishSnapshot
  count: number
  tier: StampTier
  /** 本次打卡日期，供 UI 显示在印章上。 */
  dateKey: string
  previousTier: StampTier | null
  /** 是否从铜升银或从银升金。 */
  upgraded: boolean
}

export interface CheckInReceipt {
  meal: MealType
  name: string
  components: MealComponentSnapshot[]
  calories: number | null
  tokenRewarded: boolean
  tokenCount: number
  rewardKind: 'formal' | 'custom'
  stamps: CheckInStampReceipt[]
}

export type CheckInActionResult =
  | { status: 'checked-in'; receipt: CheckInReceipt }
  | {
      status: 'blocked'
      reason:
        | 'checked-in'
        | 'no-selection'
        | 'no-components'
        | 'no-eaten'
    }
  | { status: 'error'; message: string }

export type SelectComboResult =
  | { status: 'selected' }
  | {
      status: 'blocked'
      reason: 'checked-in' | 'not-in-pool'
    }
  | { status: 'error'; message: string }

export type ComponentBlockedReason =
  | 'checked-in'
  | 'no-selection'
  | 'not-in-pool'
  | 'component-missing'
  | 'not-redrawable'
  | 'last-component'
  | 'restore-conflict'
  | 'missing-dish'
  | 'missing-discard'

export type ComponentActionFailure =
  | { status: 'ad-required' }
  | { status: 'ad-cancelled' }
  | { status: 'stale'; message: string }
  | { status: 'blocked'; reason: ComponentBlockedReason }
  | { status: 'no-candidate'; reason: 'single-candidate' }
  | { status: 'error'; message: string }

export type ComponentActionResult =
  | { status: 'updated' }
  | ComponentActionFailure

export type RedrawActionResult =
  | {
      status: 'redrawn'
      source: DrawSource | null
      shuffled: boolean
      singleCandidate: boolean
    }
  | ComponentActionFailure

export interface CheckInOverrides {
  eaten?: Readonly<Record<string, boolean>>
  ingredientGrams?: Readonly<
    Record<string, Readonly<Record<string, number>>>
  >
  customCalories?: Readonly<Record<string, number | null>>
}

export interface DiscardReference {
  dateKey: string
  meal: MealType
  candidateId: string
  componentId: string
}

export type ImportDataResult =
  | { status: 'imported' }
  | { status: 'error'; message: string }

export type ExportBackupResult =
  | { status: 'ok'; json: string }
  | { status: 'error'; message: string }

export type ClearDataResult =
  | { status: 'cleared' }
  | { status: 'error'; message: string }

export type ClearProfileResult =
  | { status: 'cleared' }
  | { status: 'error'; message: string }

export type SnapshotListResult =
  | { status: 'ok'; snapshots: SnapshotMeta[] }
  | { status: 'error'; message: string }

export type RestoreSnapshotResult =
  | { status: 'restored' }
  | { status: 'error'; message: string }

export type ResetRecoveryResult =
  | { status: 'reset' }
  | { status: 'error'; message: string }

export interface CustomDishImageInput {
  bytes: Uint8Array
  mime: ImageMime
}

export interface CustomDishInput {
  name: string
  /** 没上传图片时的兜底图标。 */
  emoji: string | null
  category: DishCategory
  meals: MealType[]
  rarity: Rarity
  ingredientRows: CustomDishIngredientRow[]
  calorieMode: CalorieMode
  /** total 模式手填总热量。 */
  calories: number | null
  cooking: CookingInfo | null
  includeInPool: boolean
  /**
   * 新建：带图时传入，否则省略。
   * 编辑：省略表示保留原图，null 表示移除，传值表示换图。
   */
  image?: CustomDishImageInput | null
}

export type CustomDishActionResult =
  | { status: 'saved'; dishId: string }
  /** 删除入口按规则执行：有记录时只归档，没有才真删。 */
  | { status: 'removed'; archived: boolean }
  | { status: 'error'; message: string }

export interface AppStore {
  status: AppStoreStatus
  error: string | null
  recovery: RecoveryState | null
  data: AppData
  todayKey: string
  /** 非持久化：最近一次可撤销的舍弃。 */
  lastDiscard: DiscardReference | null

  hydrate: () => Promise<void>
  refreshForToday: () => Promise<void>
  updateData: (updater: (data: AppData) => AppData) => Promise<void>
  updateProfile: (profile: BodyProfile | null) => Promise<void>
  clearProfile: () => Promise<ClearProfileResult>
  setShowCalories: (enabled: boolean) => Promise<void>
  setTheme: (theme: ThemeName) => Promise<void>
  dismissProfileHint: () => Promise<void>
  recordStamp: (dishId: string, dateKey?: string) => Promise<void>
  drawMeal: (type: MealType) => Promise<DrawActionResult>
  completeAdDraw: (
    type: MealType,
    completed: boolean,
    requestedDateKey: string,
  ) => Promise<DrawActionResult>
  selectCombo: (
    type: MealType,
    candidateId: string,
  ) => Promise<SelectComboResult>
  redrawComponent: (
    type: MealType,
    candidateId: string,
    componentId: string,
  ) => Promise<RedrawActionResult>
  completeAdRedraw: (
    type: MealType,
    candidateId: string,
    componentId: string,
    completed: boolean,
    requestedDateKey: string,
  ) => Promise<RedrawActionResult>
  addComponent: (
    type: MealType,
    candidateId: string,
    dishId: string,
  ) => Promise<ComponentActionResult>
  addCustomComponent: (
    type: MealType,
    candidateId: string,
    input: { name: string; calories: number | null },
  ) => Promise<ComponentActionResult>
  /** 手动改名；传 null 恢复自动/原始名字。 */
  renameCombo: (
    type: MealType,
    candidateId: string,
    name: string | null,
  ) => Promise<ComponentActionResult>
  discardComponent: (
    type: MealType,
    candidateId: string,
    componentId: string,
  ) => Promise<ComponentActionResult>
  undoDiscard: () => Promise<ComponentActionResult>
  setComponentEaten: (
    type: MealType,
    candidateId: string,
    componentId: string,
    eaten: boolean,
  ) => Promise<ComponentActionResult>
  updateComponentGrams: (
    type: MealType,
    candidateId: string,
    componentId: string,
    grams: Readonly<Record<string, number>>,
  ) => Promise<ComponentActionResult>
  updateComponentCalories: (
    type: MealType,
    candidateId: string,
    componentId: string,
    calories: number | null,
  ) => Promise<ComponentActionResult>
  checkInMeal: (
    type: MealType,
    input?: CheckInOverrides,
  ) => Promise<CheckInActionResult>
  checkInCustomMeal: (
    type: MealType,
    input: { name: string; calories: number | null },
  ) => Promise<CheckInActionResult>
  /** 导出包装格式备份（含 base64 图片）；在串行队列里执行。 */
  exportBackup: () => Promise<ExportBackupResult>
  importJson: (json: string) => Promise<ImportDataResult>
  clearData: () => Promise<ClearDataResult>
  listSnapshots: () => Promise<SnapshotListResult>
  restoreSnapshot: (id: string) => Promise<RestoreSnapshotResult>
  resetAfterRecovery: () => Promise<ResetRecoveryResult>
  createCustomDish: (input: CustomDishInput) => Promise<CustomDishActionResult>
  updateCustomDish: (
    dishId: string,
    input: CustomDishInput,
  ) => Promise<CustomDishActionResult>
  /**
   * 删除自制菜谱：有任何打卡记录或历史快照引用时只归档，
   * 完全没引用才真删并清理孤立的食材与图片。
   */
  deleteCustomDish: (dishId: string) => Promise<CustomDishActionResult>
}

interface AttemptOutcome<T> {
  /** null 表示只读，不落盘。 */
  next: AppData | null
  result: T
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function errorResult(error: unknown): { status: 'error'; message: string } {
  return { status: 'error', message: errorMessage(error) }
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) {
    return false
  }
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) {
      return false
    }
  }
  return true
}

interface LockManagerLike {
  request<T>(name: string, task: () => Promise<T>): Promise<T>
}

/** 多标签页同时导入/导出/清空/迁移时串行化；不支持 locks 时直接执行。 */
function withDataLock<T>(name: string, task: () => Promise<T>): Promise<T> {
  if (typeof navigator === 'undefined') {
    return task()
  }
  const locks = (navigator as unknown as { locks?: LockManagerLike }).locks
  if (!locks || typeof locks.request !== 'function') {
    return task()
  }
  return locks.request(name, task)
}

function readRawSchemaVersion(raw: string | null): number | null {
  if (raw === null) {
    return null
  }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return null
    }
    const version = (parsed as { schemaVersion?: unknown }).schemaVersion
    return typeof version === 'number' && Number.isInteger(version)
      ? version
      : null
  } catch {
    return null
  }
}

function readPendingImageIds(value: unknown): string[] {
  if (typeof value !== 'object' || value === null) {
    return []
  }
  const ids = (value as { imageIds?: unknown }).imageIds
  return Array.isArray(ids)
    ? ids.filter((id): id is string => typeof id === 'string')
    : []
}

function validTokenCount(day: DailyRecord, todayKey: string): number {
  if (!isTokenValid(day.tokens, todayKey)) {
    return 0
  }
  return Math.max(0, Math.floor(day.tokens.count))
}

function selectedCandidate(
  meal: MealRecord,
): ComboCandidateSnapshot | null {
  if (!meal.selectedCandidateId) {
    return null
  }
  return (
    meal.candidateCombos.find(
      (candidate) => candidate.id === meal.selectedCandidateId,
    ) ?? null
  )
}

function findCandidate(
  meal: MealRecord,
  candidateId: string,
): ComboCandidateSnapshot | null {
  return meal.candidateCombos.find((item) => item.id === candidateId) ?? null
}

function replaceCandidate(
  meal: MealRecord,
  candidate: ComboCandidateSnapshot,
): MealRecord {
  return {
    ...meal,
    candidateCombos: meal.candidateCombos.map((item) =>
      item.id === candidate.id ? candidate : item,
    ),
  }
}

function replaceMeal(
  data: AppData,
  todayKey: string,
  type: MealType,
  nextMeal: MealRecord,
  stamps: AppData['stamps'] = data.stamps,
  tokens?: DailyRecord['tokens'],
): AppData {
  const day = data.days[todayKey]!
  return {
    ...data,
    stamps,
    days: {
      ...data.days,
      [todayKey]: {
        ...day,
        ...(tokens ? { tokens } : {}),
        meals: { ...day.meals, [type]: nextMeal },
      },
    },
  }
}

function roundComboIds(meal: MealRecord): string[] {
  if (meal.drawnComboIds) {
    return [...meal.drawnComboIds]
  }
  return [
    ...new Set(
      meal.candidateCombos.flatMap((candidate) =>
        candidate.comboId ? [candidate.comboId] : [],
      ),
    ),
  ]
}

function stampSnapshot(dish: {
  id: string
  name: string
  rarity: StampDishSnapshot['rarity']
  image: string
  imageId?: string
  emoji?: string
  stampImage?: string
}): StampDishSnapshot {
  return {
    id: dish.id,
    name: dish.name,
    rarity: dish.rarity,
    ...(dish.image ? { image: dish.image } : {}),
    ...(dish.imageId ? { imageId: dish.imageId } : {}),
    ...(dish.emoji ? { emoji: dish.emoji } : {}),
    ...(dish.stampImage ? { stampImage: dish.stampImage } : {}),
  }
}

function normalizeStoreCooking(value: CookingInfo | null): CookingInfo | null {
  if (!value) {
    return null
  }
  const steps = value.steps
    .map((step) => step.trim())
    .filter((step) => step.length > 0)
  if (steps.length < 3 || steps.length > 5) {
    return null
  }
  if (steps.some((step) => countUnicodeChars(step) > 30)) {
    return null
  }
  if (
    !Number.isFinite(value.timeMinutes) ||
    value.timeMinutes < 0 ||
    value.timeMinutes > 300
  ) {
    return null
  }
  return {
    ...value,
    steps,
    timeMinutes: Math.round(value.timeMinutes),
  }
}

function normalizeStoreRows(
  rows: readonly CustomDishIngredientRow[],
): CustomDishIngredientRow[] {
  const result: CustomDishIngredientRow[] = []
  for (const row of rows) {
    const name = row.name.trim()
    if (
      !name ||
      !Number.isFinite(row.kcalPer100g) ||
      row.kcalPer100g < 0 ||
      !Number.isFinite(row.grams) ||
      row.grams <= 0
    ) {
      continue
    }
    result.push({
      ...(row.ingredientId ? { ingredientId: row.ingredientId } : {}),
      name,
      kcalPer100g: row.kcalPer100g,
      grams: row.grams,
    })
  }
  return result
}

/** 表单已经校验过；这里再兜一层，防止非法值写进主数据。 */
function normalizeCustomDishInput(
  input: CustomDishInput,
  createdAt: string,
): Omit<CustomDish, 'id' | 'imageId'> {
  const name = input.name.trim()
  if (!name || countUnicodeChars(name) > 20) {
    throw new Error('菜谱名称需要 1~20 个字')
  }
  if (!isDishCategory(input.category)) {
    throw new Error('请选择有效的菜品分类')
  }
  const meals = Array.from(new Set(input.meals.filter(isMealType)))
  if (meals.length === 0) {
    throw new Error('请至少选择一个适合餐次')
  }
  if (!customDishAllowedRarities.some((rarity) => rarity === input.rarity)) {
    throw new Error('这个稀有度不能用于自制菜')
  }

  const rows = normalizeStoreRows(input.ingredientRows)
  const total =
    input.calories !== null &&
    Number.isFinite(input.calories) &&
    input.calories > 0
      ? Math.round(input.calories)
      : null
  const calorieMode: CalorieMode =
    input.calorieMode === 'total' && total !== null
      ? 'total'
      : 'ingredients'
  if (calorieMode === 'ingredients' && rows.length === 0) {
    throw new Error('至少添加一种食材，或改成直接填写总热量')
  }

  const emoji = input.emoji?.trim() ? input.emoji.trim().slice(0, 16) : null

  return {
    name,
    emoji,
    category: input.category,
    meals,
    rarity: input.rarity,
    ingredientRows: rows,
    calorieMode,
    calories: calorieMode === 'total' ? total : null,
    cooking: normalizeStoreCooking(input.cooking),
    includeInPool: input.includeInPool,
    archived: false,
    createdAt,
  }
}

export interface AppStoreOptions {
  snapshots?: SnapshotService
  namespace?: StorageNamespace
}

export function createAppStore(
  adapter: StorageAdapter = storage,
  clock: () => string = () => toDateKey(),
  rng: Rng = Math.random,
  imageAdapter: BinaryStorageAdapter = storage,
  options: AppStoreOptions = {},
) {
  return create<AppStore>()((set, get) => {
    const initialKey = clock()
    const snapshots = options.snapshots ?? snapshotService
    const lockName = dataTransferLockName(options.namespace ?? 'prod')
    let queue: Promise<unknown> = Promise.resolve()

    const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
      const run = queue.then(task, task)
      queue = run.then(
        () => undefined,
        () => undefined,
      )
      return run
    }

    const fail = (error: unknown): never => {
      set({
        status: 'error',
        error: errorMessage(error),
        recovery: null,
      })
      throw error
    }

    /**
     * 上次导入可能停在“图片写完、数据没写”。只删除当前 app-data
     * 没有引用的图片；数据已写但标记未删时，绝不能误删正在使用的图片。
     */
    const cleanupPendingImages = async (data: AppData): Promise<void> => {
      try {
        const pending = await adapter.get<unknown>(PENDING_IMPORT_KEY)
        if (pending === null || pending === undefined) {
          return
        }
        const referenced = new Set(collectReferencedImageIds(data))
        for (const imageId of readPendingImageIds(pending)) {
          if (referenced.has(imageId)) {
            continue
          }
          try {
            await imageAdapter.deleteImage(imageId)
          } catch {
            // 单张清理失败不阻塞启动，标记仍然会移除。
          }
        }
        await adapter.remove(PENDING_IMPORT_KEY)
      } catch {
        // 清理只是尽力而为，失败不影响正常启动。
      }
    }

    /**
     * 串行队列内的一次读写。gameplay 的只读结果（例如需要广告）
     * 通过 next: null 表达，不触碰存储。
     */
    const runAttempt = async <T>(
      build: (data: AppData, todayKey: string) => AttemptOutcome<T>,
    ): Promise<T> => {
      const today = clock()
      const current = ensureToday(get().data, today)
      const outcome = build(current, today)

      if (outcome.next === null) {
        return outcome.result
      }

      await saveAppData(adapter, outcome.next)
      set({
        data: outcome.next,
        todayKey: today,
        status: 'ready',
        error: null,
        recovery: null,
      })
      return outcome.result
    }

    const attempt = <T>(
      build: (data: AppData, todayKey: string) => AttemptOutcome<T>,
    ): Promise<T> => enqueue(() => runAttempt(build))

    /**
     * 破坏性操作专用：在同一个队列任务里先快照，再执行 builder。
     * 不能再调用 attempt/commit，否则会嵌套 enqueue 死锁。
     */
    const attemptWithSnapshot = <T>(
      reason: SnapshotReason,
      build: (data: AppData, todayKey: string) => AttemptOutcome<T>,
    ): Promise<T> =>
      enqueue(() =>
        withDataLock(lockName, async () => {
          await snapshots.capture({
            reason,
            data: get().status === 'recovery' ? null : get().data,
          })
          return runAttempt(build)
        }),
      )

    const captureCurrent = (reason: SnapshotReason) =>
      snapshots.capture({
        reason,
        data: get().status === 'recovery' ? null : get().data,
      })

    const commit = async (
      build: (data: AppData, todayKey: string) => AppData,
    ): Promise<void> => {
      await attempt((data, todayKey) => ({
        next: build(data, todayKey),
        result: undefined,
      }))
    }

    /** 只清理确实没人引用的图片；清理失败就留成孤儿，不让历史破图。 */
    const deleteImageIfUnreferenced = async (
      imageId: string,
      data: AppData,
    ): Promise<void> => {
      if (collectReferencedImageIds(data).includes(imageId)) {
        return
      }
      try {
        await imageAdapter.deleteImage(imageId)
      } catch {
        // 图片清理是尽力而为，失败不影响主数据。
      }
    }

    /** 把表单里的新食材落成自定义食材，同名复用已有条目。 */
    const reconcileCustomIngredients = (
      existing: readonly CustomIngredient[],
      rows: readonly CustomDishIngredientRow[],
    ): {
      ingredients: CustomIngredient[]
      rows: CustomDishIngredientRow[]
    } => {
      const ingredients = [...existing]
      const byName = new Map(ingredients.map((item) => [item.name, item]))

      const nextRows = rows.map((row) => {
        if (row.ingredientId) {
          const found = ingredients.find(
            (item) => item.id === row.ingredientId,
          )
          return found
            ? {
                ...row,
                name: found.name,
                kcalPer100g: found.kcalPer100g,
              }
            : row
        }

        const found = byName.get(row.name)
        if (found) {
          return {
            ...row,
            ingredientId: found.id,
            name: found.name,
            kcalPer100g: found.kcalPer100g,
          }
        }

        const created: CustomIngredient = {
          id: createCustomIngredientId(),
          name: row.name,
          kcalPer100g: row.kcalPer100g,
        }
        ingredients.push(created)
        byName.set(created.name, created)
        return {
          ...row,
          ingredientId: created.id,
          name: created.name,
          kcalPer100g: created.kcalPer100g,
        }
      })

      return { ingredients, rows: nextRows }
    }

    const saveCustomDish = async (
      dishId: string | null,
      input: CustomDishInput,
    ): Promise<CustomDishActionResult> => {
      try {
        return await enqueue(async () => {
          const today = clock()
          const data = ensureToday(get().data, today)
          const existing = dishId
            ? (data.customDishes.find((dish) => dish.id === dishId) ?? null)
            : null
          if (dishId && !existing) {
            throw new Error('找不到这道菜谱')
          }

          const fields = normalizeCustomDishInput(
            input,
            existing?.createdAt || today,
          )
          const reconciled = reconcileCustomIngredients(
            data.customIngredients,
            fields.ingredientRows,
          )

          let imageId = existing?.imageId ?? null
          let writtenImageId: string | null = null
          if (input.image) {
            imageId = createImageId()
            await imageAdapter.putImage(imageId, {
              mime: input.image.mime,
              bytes: input.image.bytes,
            })
            writtenImageId = imageId
          } else if (input.image === null) {
            imageId = null
          }

          const nextDish: CustomDish = {
            ...fields,
            id: existing?.id ?? createCustomDishId(),
            imageId,
            ingredientRows: reconciled.rows,
            // 归档菜保持归档，且永远不进抽卡池。
            archived: existing?.archived ?? false,
            includeInPool: existing?.archived
              ? false
              : fields.includeInPool,
          }

          const customDishes = existing
            ? data.customDishes.map((dish) =>
                dish.id === nextDish.id ? nextDish : dish,
              )
            : [...data.customDishes, nextDish]
          const next: AppData = {
            ...data,
            customIngredients: reconciled.ingredients,
            customDishes,
          }

          try {
            await saveAppData(adapter, next)
          } catch (error) {
            // 数据没写成功，撤掉刚写的新图，避免留下孤儿。
            if (writtenImageId) {
              try {
                await imageAdapter.deleteImage(writtenImageId)
              } catch {
                // 忽略回滚失败。
              }
            }
            throw error
          }

          set({
            data: next,
            todayKey: today,
            status: 'ready',
            error: null,
          })

          if (existing?.imageId && existing.imageId !== imageId) {
            await deleteImageIfUnreferenced(existing.imageId, next)
          }

          return { status: 'saved', dishId: nextDish.id }
        })
      } catch (error) {
        return errorResult(error)
      }
    }

    const commitDrawResult = (
      data: AppData,
      todayKey: string,
      type: MealType,
      draw: {
        combo: Parameters<typeof createComboCandidate>[0]
        source: DrawSource
        budget: MealRecord['budget']
        tokenCount: number
        pityCount: number
        pityTriggered: boolean
        shuffled: boolean
        singleCandidate: boolean
        nextDrawnComboIds: string[]
      },
    ): AttemptOutcome<DrawActionResult> => {
      const day = data.days[todayKey]!
      const meal = day.meals[type]
      // 抽到的可能是自制菜的隐藏套餐，部件必须按当前菜品库解析，
      // 否则会退化成“缺失菜品”占位快照（名称是 id、没有热量和图片）。
      const usedCandidateIds = new Set(
        meal.candidateCombos.map((candidate) => candidate.id),
      )
      const candidateId = createCandidateInstanceId(
        draw.combo.id,
        usedCandidateIds,
      )
      const candidate = createComboCandidate(draw.combo, 'draw', candidateId, {
        dishById: buildDishLibrary(data).dishById,
      })
      const nextMeal: MealRecord = {
        ...meal,
        candidateCombos: [...meal.candidateCombos, candidate],
        budget: draw.budget,
        drawnComboIds: draw.nextDrawnComboIds,
      }
      const next = replaceMeal(data, todayKey, type, nextMeal, data.stamps, {
        ...day.tokens,
        count: draw.tokenCount,
      })

      return {
        next: {
          ...next,
          pityCount: draw.pityCount,
        },
        result: {
          status: 'drawn',
          receipt: {
            meal: type,
            candidate,
            source: draw.source,
            pityTriggered: draw.pityTriggered,
            tokenCount: draw.tokenCount,
            pityCount: draw.pityCount,
            shuffled: draw.shuffled,
            singleCandidate: draw.singleCandidate,
          },
        },
      }
    }

    const redraw = (
      data: AppData,
      todayKey: string,
      type: MealType,
      candidateId: string,
      componentId: string,
      adCompleted: boolean,
    ): { outcome: AttemptOutcome<RedrawActionResult>; result?: null } => {
      const day = data.days[todayKey]!
      const meal = day.meals[type]
      if (meal.budget.checkedIn) {
        return {
          outcome: {
            next: null,
            result: { status: 'blocked', reason: 'checked-in' },
          },
        }
      }
      if (meal.selectedCandidateId !== candidateId) {
        return {
          outcome: {
            next: null,
            result: {
              status: 'blocked',
              reason: meal.selectedCandidateId ? 'not-in-pool' : 'no-selection',
            },
          },
        }
      }
      const candidate = findCandidate(meal, candidateId)
      if (!candidate) {
        return {
          outcome: {
            next: null,
            result: { status: 'blocked', reason: 'not-in-pool' },
          },
        }
      }

      const result = coreRedrawComponent(
        {
          meal: type,
          candidate,
          componentId,
          budget: meal.budget,
          tokenCount: validTokenCount(day, todayKey),
          pityCount: data.pityCount,
        },
        {
          rng: rng,
          adCompleted,
          dishCatalog: buildDishLibrary(data).dishes,
        },
      )

      if (result.status === 'requires-ad') {
        return { outcome: { next: null, result: { status: 'ad-required' } } }
      }
      if (result.status === 'blocked') {
        return {
          outcome: {
            next: null,
            result: { status: 'blocked', reason: result.reason },
          },
        }
      }
      if (result.status === 'no-candidate') {
        return {
          outcome: {
            next: null,
            result: { status: 'no-candidate', reason: result.reason },
          },
        }
      }

      const nextMeal = {
        ...replaceCandidate(
          meal,
          refreshComboName(result.candidate, type),
        ),
        budget: result.budget,
      }
      const next = replaceMeal(data, todayKey, type, nextMeal, data.stamps, {
        ...day.tokens,
        count: result.tokenCount,
      })

      return {
        outcome: {
          next: { ...next, pityCount: result.pityCount },
          result: {
            status: 'redrawn',
            source: result.source,
            shuffled: result.shuffled,
            singleCandidate: result.singleCandidate,
          },
        },
      }
    }

    const applyCheckIn = (
      data: AppData,
      todayKey: string,
      type: MealType,
      candidate: ComboCandidateSnapshot,
      overrides: CheckInOverrides | undefined,
      customOnly: boolean,
    ): AttemptOutcome<CheckInActionResult> => {
      const day = data.days[todayKey]!
      const meal = day.meals[type]
      const library = buildDishLibrary(data)
      const namedCandidate = refreshComboName(candidate, type)
      const checked = coreCheckInMeal({
        candidate: namedCandidate,
        budget: meal.budget,
        wallet: day.tokens,
        dateKey: todayKey,
        dishCatalog: library.dishById,
        ...(overrides?.eaten ? { eaten: overrides.eaten } : {}),
        ...(overrides?.ingredientGrams
          ? { ingredientGrams: overrides.ingredientGrams }
          : {}),
        ...(overrides?.customCalories
          ? { customCalories: overrides.customCalories }
          : {}),
      })

      if (checked.status === 'blocked') {
        return {
          next: null,
          result: { status: 'blocked', reason: checked.reason },
        }
      }

      let stamps = data.stamps
      const stampReceipts: CheckInStampReceipt[] = []
      for (const dishId of checked.stampDishIds) {
        const dish = library.dishById.get(dishId)
        if (!dish) {
          continue
        }
        const previousCount = stamps[dishId]?.checkInCount ?? 0
        stamps = recordStampCheckIn(stamps, dishId, todayKey)
        const record = stamps[dishId]!
        const upgrade = getStampUpgrade(previousCount, record.checkInCount)
        const tier = getStampTier(record.checkInCount)
        if (!tier) {
          continue
        }
        stampReceipts.push({
          dish: stampSnapshot(dish),
          count: record.checkInCount,
          tier,
          dateKey: todayKey,
          previousTier: upgrade.previousTier,
          upgraded: upgrade.upgraded,
        })
      }

      const finalCandidate: ComboCandidateSnapshot = {
        ...namedCandidate,
        components: checked.components,
      }
      const nextMeal: MealRecord = {
        ...replaceCandidate(meal, finalCandidate),
        selectedCandidateId: namedCandidate.id,
        calories: checked.calories,
        budget: checked.budget,
      }
      const next = replaceMeal(
        data,
        todayKey,
        type,
        nextMeal,
        stamps,
        checked.wallet,
      )

      return {
        next,
        result: {
          status: 'checked-in',
          receipt: {
            meal: type,
            name: finalCandidate.name,
            components: checked.components,
            calories: checked.calories,
            tokenRewarded: checked.tokenRewarded,
            tokenCount: checked.wallet.count,
            rewardKind: customOnly ? 'custom' : checked.rewardKind,
            stamps: stampReceipts,
          },
        },
      }
    }

    return {
      status: 'idle',
      error: null,
      recovery: null,
      data: createEmptyAppData(initialKey),
      todayKey: initialKey,
      lastDiscard: null,

      hydrate: async () => {
        const currentStatus = get().status
        if (currentStatus === 'loading' || currentStatus === 'ready') {
          return
        }

        set({ status: 'loading', error: null, recovery: null })
        try {
          await withDataLock(lockName, async () => {
            const today = clock()
            const loaded = await loadAppData(adapter, today, { snapshots })

            if (loaded.status === 'unavailable') {
              throw new Error(loaded.error ?? '本地存储不可用')
            }

            if (
              loaded.status === 'future' ||
              loaded.status === 'corrupt' ||
              loaded.status === 'migration-failed'
            ) {
              set({
                status: 'recovery',
                recovery: {
                  reason:
                    loaded.status === 'future'
                      ? 'future'
                      : loaded.status === 'corrupt'
                        ? 'corrupt'
                        : 'migration-failed',
                  message: loaded.error ?? '数据读取失败',
                  raw: loaded.raw,
                  sourceVersion: loaded.sourceVersion,
                  snapshotId: loaded.snapshotId,
                },
                data: createEmptyAppData(today),
                todayKey: today,
                error: null,
                lastDiscard: null,
              })
              return
            }

            const next = ensureToday(loaded.data, today)
            if (loaded.status === 'new') {
              // 只有“确实没有数据”的全新用户才落盘默认值。
              await saveAppData(adapter, next)
            }

            await cleanupPendingImages(next)
            set({
              data: next,
              todayKey: today,
              status: 'ready',
              error: null,
              recovery: null,
              lastDiscard: null,
            })
          })
        } catch (error) {
          fail(error)
        }
      },

      refreshForToday: async () => {
        try {
          await commit((data) => data)
          set({ lastDiscard: null })
        } catch (error) {
          fail(error)
        }
      },

      updateData: async (updater) => {
        try {
          await commit((data) => updater(data))
        } catch (error) {
          fail(error)
        }
      },

      updateProfile: async (profile) => {
        try {
          await commit((data) => ({
            ...data,
            profile,
            targetCalories: profile ? calcTargetCalories(profile) : null,
          }))
        } catch (error) {
          fail(error)
        }
      },

      clearProfile: async () => {
        try {
          await attemptWithSnapshot('before-clear-profile', (data) => ({
            next: {
              ...data,
              profile: null,
              targetCalories: null,
            },
            result: undefined,
          }))
          return { status: 'cleared' }
        } catch (error) {
          return { status: 'error', message: errorMessage(error) }
        }
      },

      setShowCalories: async (enabled) => {
        try {
          await commit((data) => ({
            ...data,
            settings: {
              ...data.settings,
              showCalories: enabled,
            },
          }))
        } catch (error) {
          fail(error)
        }
      },

      setTheme: async (theme) => {
        try {
          await commit((data) => ({
            ...data,
            settings: {
              ...data.settings,
              theme,
            },
          }))
        } catch (error) {
          fail(error)
        }
      },

      dismissProfileHint: async () => {
        try {
          await commit((data) => ({
            ...data,
            settings: { ...data.settings, profileHintDismissed: true },
          }))
        } catch (error) {
          fail(error)
        }
      },

      recordStamp: async (dishId, dateKey) => {
        try {
          await commit((data, todayKey) => ({
            ...data,
            stamps: recordStampCheckIn(
              data.stamps,
              dishId,
              dateKey ?? todayKey,
            ),
          }))
        } catch (error) {
          fail(error)
        }
      },

      drawMeal: async (type) => {
        try {
          return await attempt<DrawActionResult>((data, todayKey) => {
            const day = data.days[todayKey]!
            const meal = day.meals[type]

            if (meal.budget.checkedIn) {
              return {
                next: null,
                result: { status: 'blocked', reason: 'checked-in' },
              }
            }

            const draw = drawForMeal(
              {
                meal: type,
                budget: meal.budget,
                tokenCount: validTokenCount(day, todayKey),
                pityCount: data.pityCount,
                drawnComboIds: roundComboIds(meal),
              },
              { rng, catalog: buildDishLibrary(data).combos },
            )

            if (draw.status === 'requires-ad') {
              return { next: null, result: { status: 'ad-required' } }
            }
            if (draw.status === 'blocked') {
              return {
                next: null,
                result: { status: 'blocked', reason: draw.reason },
              }
            }

            return commitDrawResult(data, todayKey, type, draw)
          })
        } catch (error) {
          return errorResult(error)
        }
      },

      completeAdDraw: async (type, completed, requestedDateKey) => {
        if (!completed) {
          return { status: 'ad-cancelled' }
        }

        try {
          return await attempt<DrawActionResult>((data, todayKey) => {
            if (todayKey !== requestedDateKey) {
              return {
                next: null,
                result: {
                  status: 'stale',
                  message: '日期已经翻篇啦，请重新抽卡',
                },
              }
            }

            const day = data.days[todayKey]!
            const meal = day.meals[type]

            if (meal.budget.checkedIn) {
              return {
                next: null,
                result: { status: 'blocked', reason: 'checked-in' },
              }
            }

            const tokenCount = validTokenCount(day, todayKey)
            const allowance = getDrawAllowance(meal.budget, tokenCount)

            if (!allowance.canDraw) {
              return {
                next: null,
                result: { status: 'blocked', reason: 'checked-in' },
              }
            }
            if (allowance.nextSource !== 'ad') {
              return {
                next: null,
                result: {
                  status: 'stale',
                  message: '抽卡次数有变化，请重新点一次',
                },
              }
            }

            const draw = drawForMeal(
              {
                meal: type,
                budget: meal.budget,
                tokenCount,
                pityCount: data.pityCount,
                drawnComboIds: roundComboIds(meal),
              },
              {
                rng,
                adCompleted: true,
                catalog: buildDishLibrary(data).combos,
              },
            )

            if (draw.status !== 'drawn') {
              return {
                next: null,
                result:
                  draw.status === 'blocked'
                    ? { status: 'blocked', reason: draw.reason }
                    : {
                        status: 'stale',
                        message: '抽卡状态有变化，请重新点一次',
                      },
              }
            }

            return commitDrawResult(data, todayKey, type, draw)
          })
        } catch (error) {
          return errorResult(error)
        }
      },

      selectCombo: async (type, candidateId) => {
        try {
          return await attempt<SelectComboResult>((data, todayKey) => {
            const day = data.days[todayKey]!
            const meal = day.meals[type]

            if (meal.budget.checkedIn) {
              return {
                next: null,
                result: { status: 'blocked', reason: 'checked-in' },
              }
            }
            if (!findCandidate(meal, candidateId)) {
              return {
                next: null,
                result: { status: 'blocked', reason: 'not-in-pool' },
              }
            }
            if (meal.selectedCandidateId === candidateId) {
              return { next: null, result: { status: 'selected' } }
            }

            return {
              next: replaceMeal(data, todayKey, type, {
                ...meal,
                selectedCandidateId: candidateId,
              }),
              result: { status: 'selected' },
            }
          })
        } catch (error) {
          return errorResult(error)
        }
      },

      redrawComponent: async (type, candidateId, componentId) => {
        try {
          return await attempt<RedrawActionResult>((data, todayKey) => {
            const outcome = redraw(
              data,
              todayKey,
              type,
              candidateId,
              componentId,
              false,
            )
            return outcome.outcome
          })
        } catch (error) {
          return errorResult(error)
        }
      },

      completeAdRedraw: async (
        type,
        candidateId,
        componentId,
        completed,
        requestedDateKey,
      ) => {
        if (!completed) {
          return { status: 'ad-cancelled' }
        }

        try {
          return await attempt<RedrawActionResult>((data, todayKey) => {
            if (todayKey !== requestedDateKey) {
              return {
                next: null,
                result: {
                  status: 'stale',
                  message: '日期已经翻篇啦，请重新操作',
                },
              }
            }

            const day = data.days[todayKey]!
            const meal = day.meals[type]
            if (meal.selectedCandidateId !== candidateId) {
              return {
                next: null,
                result: {
                  status: 'stale',
                  message: '选中的套餐有变化，请重新点一次',
                },
              }
            }
            const allowance = getDrawAllowance(
              meal.budget,
              validTokenCount(day, todayKey),
            )
            if (allowance.nextSource !== 'ad') {
              return {
                next: null,
                result: {
                  status: 'stale',
                  message: '抽卡次数有变化，请重新点一次',
                },
              }
            }

            const outcome = redraw(
              data,
              todayKey,
              type,
              candidateId,
              componentId,
              true,
            )
            if (outcome.outcome.result.status !== 'redrawn') {
              return {
                next: null,
                result: {
                  status: 'stale',
                  message: '重抽状态有变化，请重新点一次',
                },
              }
            }
            return outcome.outcome
          })
        } catch (error) {
          return errorResult(error)
        }
      },

      addComponent: async (type, candidateId, dishId) => {
        try {
          return await attempt<ComponentActionResult>((data, todayKey) => {
            const day = data.days[todayKey]!
            const meal = day.meals[type]
            if (meal.budget.checkedIn) {
              return {
                next: null,
                result: { status: 'blocked', reason: 'checked-in' },
              }
            }
            const candidate = findCandidate(meal, candidateId)
            if (!candidate) {
              return {
                next: null,
                result: { status: 'blocked', reason: 'not-in-pool' },
              }
            }
            const dish = buildDishLibrary(data).poolDishById.get(dishId)
            if (!dish) {
              return {
                next: null,
                result: { status: 'blocked', reason: 'missing-dish' },
              }
            }

            try {
              const nextCandidate = refreshComboName(
                addDishComponent(candidate, dish, type),
                type,
              )
              return {
                next: replaceMeal(
                  data,
                  todayKey,
                  type,
                  replaceCandidate(meal, nextCandidate),
                ),
                result: { status: 'updated' },
              }
            } catch (error) {
              return { next: null, result: errorResult(error) }
            }
          })
        } catch (error) {
          return errorResult(error)
        }
      },

      addCustomComponent: async (type, candidateId, input) => {
        try {
          return await attempt<ComponentActionResult>((data, todayKey) => {
            const day = data.days[todayKey]!
            const meal = day.meals[type]
            if (meal.budget.checkedIn) {
              return {
                next: null,
                result: { status: 'blocked', reason: 'checked-in' },
              }
            }
            const candidate = findCandidate(meal, candidateId)
            if (!candidate) {
              return {
                next: null,
                result: { status: 'blocked', reason: 'not-in-pool' },
              }
            }

            try {
              const nextCandidate = refreshComboName(
                addCustomComponent(candidate, input),
                type,
              )
              return {
                next: replaceMeal(
                  data,
                  todayKey,
                  type,
                  replaceCandidate(meal, nextCandidate),
                ),
                result: { status: 'updated' },
              }
            } catch (error) {
              return { next: null, result: errorResult(error) }
            }
          })
        } catch (error) {
          return errorResult(error)
        }
      },

      renameCombo: async (type, candidateId, name) => {
        try {
          return await attempt<ComponentActionResult>((data, todayKey) => {
            const day = data.days[todayKey]!
            const meal = day.meals[type]
            if (meal.budget.checkedIn) {
              return {
                next: null,
                result: { status: 'blocked', reason: 'checked-in' },
              }
            }
            if (meal.selectedCandidateId !== candidateId) {
              return {
                next: null,
                result: {
                  status: 'blocked',
                  reason: meal.selectedCandidateId
                    ? 'not-in-pool'
                    : 'no-selection',
                },
              }
            }
            const candidate = findCandidate(meal, candidateId)
            if (!candidate) {
              return {
                next: null,
                result: { status: 'blocked', reason: 'not-in-pool' },
              }
            }

            try {
              const nextCandidate =
                name === null
                  ? withAutoComboName(candidate, type)
                  : withManualComboName(candidate, name)
              return {
                next: replaceMeal(
                  data,
                  todayKey,
                  type,
                  replaceCandidate(meal, nextCandidate),
                ),
                result: { status: 'updated' },
              }
            } catch (error) {
              return { next: null, result: errorResult(error) }
            }
          })
        } catch (error) {
          return errorResult(error)
        }
      },

      discardComponent: async (type, candidateId, componentId) => {
        try {
          return await attempt<ComponentActionResult>((data, todayKey) => {
            const day = data.days[todayKey]!
            const meal = day.meals[type]
            if (meal.budget.checkedIn) {
              return {
                next: null,
                result: { status: 'blocked', reason: 'checked-in' },
              }
            }
            if (meal.selectedCandidateId !== candidateId) {
              return {
                next: null,
                result: {
                  status: 'blocked',
                  reason: meal.selectedCandidateId
                    ? 'not-in-pool'
                    : 'no-selection',
                },
              }
            }
            const candidate = findCandidate(meal, candidateId)
            if (!candidate) {
              return {
                next: null,
                result: { status: 'blocked', reason: 'not-in-pool' },
              }
            }

            try {
              const nextCandidate = refreshComboName(
                discardComponent(candidate, componentId),
                type,
              )
              set({
                lastDiscard: {
                  dateKey: todayKey,
                  meal: type,
                  candidateId,
                  componentId,
                },
              })
              return {
                next: replaceMeal(
                  data,
                  todayKey,
                  type,
                  replaceCandidate(meal, nextCandidate),
                ),
                result: { status: 'updated' },
              }
            } catch (error) {
              return { next: null, result: errorResult(error) }
            }
          })
        } catch (error) {
          return errorResult(error)
        }
      },

      undoDiscard: async () => {
        const last = get().lastDiscard
        if (!last) {
          return { status: 'blocked', reason: 'missing-discard' }
        }

        try {
          return await attempt<ComponentActionResult>((data, todayKey) => {
            if (last.dateKey !== todayKey) {
              return {
                next: null,
                result: {
                  status: 'blocked',
                  reason: 'missing-discard',
                },
              }
            }
            const day = data.days[todayKey]!
            const meal = day.meals[last.meal]
            if (meal.budget.checkedIn) {
              return {
                next: null,
                result: { status: 'blocked', reason: 'checked-in' },
              }
            }
            const candidate = findCandidate(meal, last.candidateId)
            if (!candidate) {
              return {
                next: null,
                result: {
                  status: 'blocked',
                  reason: 'missing-discard',
                },
              }
            }

            try {
              const nextCandidate = refreshComboName(
                restoreComponent(candidate, last.componentId),
                last.meal,
              )
              set({ lastDiscard: null })
              return {
                next: replaceMeal(
                  data,
                  todayKey,
                  last.meal,
                  replaceCandidate(meal, nextCandidate),
                ),
                result: { status: 'updated' },
              }
            } catch {
              return {
                next: null,
                result: { status: 'blocked', reason: 'restore-conflict' },
              }
            }
          })
        } catch (error) {
          return errorResult(error)
        }
      },

      setComponentEaten: async (
        type,
        candidateId,
        componentId,
        eaten,
      ) => {
        try {
          return await attempt<ComponentActionResult>((data, todayKey) => {
            const day = data.days[todayKey]!
            const meal = day.meals[type]
            if (meal.budget.checkedIn) {
              return {
                next: null,
                result: { status: 'blocked', reason: 'checked-in' },
              }
            }
            const candidate = findCandidate(meal, candidateId)
            if (!candidate) {
              return {
                next: null,
                result: { status: 'blocked', reason: 'not-in-pool' },
              }
            }

            try {
              const nextCandidate = withComponentEaten(
                candidate,
                componentId,
                eaten,
              )
              return {
                next: replaceMeal(
                  data,
                  todayKey,
                  type,
                  replaceCandidate(meal, nextCandidate),
                ),
                result: { status: 'updated' },
              }
            } catch (error) {
              return { next: null, result: errorResult(error) }
            }
          })
        } catch (error) {
          return errorResult(error)
        }
      },

      updateComponentGrams: async (
        type,
        candidateId,
        componentId,
        grams,
      ) => {
        try {
          return await attempt<ComponentActionResult>((data, todayKey) => {
            const day = data.days[todayKey]!
            const meal = day.meals[type]
            if (meal.budget.checkedIn) {
              return {
                next: null,
                result: { status: 'blocked', reason: 'checked-in' },
              }
            }
            const candidate = findCandidate(meal, candidateId)
            if (!candidate) {
              return {
                next: null,
                result: { status: 'blocked', reason: 'not-in-pool' },
              }
            }
            const component = candidate.components.find(
              (item) => item.id === componentId,
            )
            if (!component) {
              return {
                next: null,
                result: { status: 'blocked', reason: 'component-missing' },
              }
            }

            try {
              const nextComponent = withComponentIngredientGrams(
                component,
                grams,
              )
              const nextCandidate = replaceComponentSnapshot(
                candidate,
                componentId,
                nextComponent,
              )
              return {
                next: replaceMeal(
                  data,
                  todayKey,
                  type,
                  replaceCandidate(meal, nextCandidate),
                ),
                result: { status: 'updated' },
              }
            } catch (error) {
              return { next: null, result: errorResult(error) }
            }
          })
        } catch (error) {
          return errorResult(error)
        }
      },

      updateComponentCalories: async (
        type,
        candidateId,
        componentId,
        calories,
      ) => {
        try {
          return await attempt<ComponentActionResult>((data, todayKey) => {
            const day = data.days[todayKey]!
            const meal = day.meals[type]
            if (meal.budget.checkedIn) {
              return {
                next: null,
                result: { status: 'blocked', reason: 'checked-in' },
              }
            }
            const candidate = findCandidate(meal, candidateId)
            if (!candidate) {
              return {
                next: null,
                result: { status: 'blocked', reason: 'not-in-pool' },
              }
            }
            const component = candidate.components.find(
              (item) => item.id === componentId,
            )
            if (!component) {
              return {
                next: null,
                result: { status: 'blocked', reason: 'component-missing' },
              }
            }

            try {
              const nextComponent = withCustomComponentCalories(
                component,
                calories,
              )
              const nextCandidate = replaceComponentSnapshot(
                candidate,
                componentId,
                nextComponent,
              )
              return {
                next: replaceMeal(
                  data,
                  todayKey,
                  type,
                  replaceCandidate(meal, nextCandidate),
                ),
                result: { status: 'updated' },
              }
            } catch (error) {
              return { next: null, result: errorResult(error) }
            }
          })
        } catch (error) {
          return errorResult(error)
        }
      },

      checkInMeal: async (type, input) => {
        try {
          return await attempt<CheckInActionResult>((data, todayKey) => {
            const day = data.days[todayKey]!
            const meal = day.meals[type]
            if (meal.budget.checkedIn) {
              return {
                next: null,
                result: { status: 'blocked', reason: 'checked-in' },
              }
            }
            const candidate = selectedCandidate(meal)
            if (!candidate) {
              return {
                next: null,
                result: { status: 'blocked', reason: 'no-selection' },
              }
            }

            const outcome = applyCheckIn(
              data,
              todayKey,
              type,
              candidate,
              input,
              false,
            )
            if (outcome.result.status === 'checked-in') {
              set({ lastDiscard: null })
            }
            return outcome
          })
        } catch (error) {
          return errorResult(error)
        }
      },

      checkInCustomMeal: async (type, input) => {
        try {
          return await attempt<CheckInActionResult>((data, todayKey) => {
            const day = data.days[todayKey]!
            const meal = day.meals[type]
            if (meal.budget.checkedIn) {
              return {
                next: null,
                result: { status: 'blocked', reason: 'checked-in' },
              }
            }

            const id = `custom:${todayKey}:${type}:${meal.candidateCombos.length}`
            const candidate = createCustomOnlyCandidate({
              id,
              name: input.name,
              calories: input.calories,
            })
            const withCandidate: MealRecord = {
              ...meal,
              candidateCombos: [...meal.candidateCombos, candidate],
              selectedCandidateId: candidate.id,
            }
            const base: AppData = replaceMeal(
              data,
              todayKey,
              type,
              withCandidate,
            )
            const outcome = applyCheckIn(
              base,
              todayKey,
              type,
              candidate,
              undefined,
              true,
            )
            if (outcome.result.status === 'checked-in') {
              set({ lastDiscard: null })
            }
            return outcome
          })
        } catch (error) {
          return errorResult(error)
        }
      },

      createCustomDish: async (input) => saveCustomDish(null, input),

      updateCustomDish: async (dishId, input) =>
        saveCustomDish(dishId, input),

      deleteCustomDish: async (dishId) => {
        try {
          return await enqueue<CustomDishActionResult>(async () => {
            const today = clock()
            const data = ensureToday(get().data, today)
            const existing = data.customDishes.find(
              (dish) => dish.id === dishId,
            )
            if (!existing) {
              throw new Error('找不到这道菜谱')
            }

            const mustArchive =
              hasCheckInRecords(data, dishId) ||
              hasAnySnapshotReference(data, { dishId })
            if (mustArchive) {
              if (existing.archived) {
                return { status: 'removed', archived: true }
              }
              const next: AppData = {
                ...data,
                customDishes: data.customDishes.map((dish) =>
                  dish.id === dishId
                    ? { ...dish, archived: true, includeInPool: false }
                    : dish,
                ),
              }
              await saveAppData(adapter, next)
              set({
                data: next,
                todayKey: today,
                status: 'ready',
                error: null,
              })
              return { status: 'removed', archived: true }
            }

            const customDishes = data.customDishes.filter(
              (dish) => dish.id !== dishId,
            )
            const usedIngredientIds = new Set(
              customDishes.flatMap((dish) =>
                dish.ingredientRows.flatMap((row) =>
                  row.ingredientId ? [row.ingredientId] : [],
                ),
              ),
            )
            const next: AppData = {
              ...data,
              customDishes,
              customIngredients: data.customIngredients.filter((item) =>
                usedIngredientIds.has(item.id),
              ),
            }
            await saveAppData(adapter, next)
            set({
              data: next,
              todayKey: today,
              status: 'ready',
              error: null,
            })

            if (existing.imageId) {
              await deleteImageIfUnreferenced(existing.imageId, next)
            }

            return { status: 'removed', archived: false }
          })
        } catch (error) {
          return errorResult(error)
        }
      },

      exportBackup: async () => {
        try {
          return await enqueue<ExportBackupResult>(() =>
            withDataLock(lockName, async () => {
              const data = get().data
              const images = new Map<string, StoredImage>()
              for (const imageId of collectReferencedImageIds(data)) {
                const image = await imageAdapter.getImage(imageId)
                if (image) {
                  images.set(imageId, image)
                }
              }

              const bundle = buildBackup(data, images, clock())
              return { status: 'ok', json: serializeBackup(bundle) }
            }),
          )
        } catch (error) {
          // 导出失败只回报，不影响当前记录。
          return { status: 'error', message: errorMessage(error) }
        }
      },

      importJson: async (json) => {
        try {
          return await enqueue<ImportDataResult>(() =>
            withDataLock(lockName, async () => {
              const today = clock()
              const parsed = parseBackupJson(json, today)
              const fromPackage = new Set(
                parsed.images.map((image) => image.imageId),
              )

              // 包内没有的图片必须已经在本地，否则导入后历史会破图。
              for (const imageId of collectReferencedImageIds(parsed.data)) {
                if (fromPackage.has(imageId)) {
                  continue
                }
                const existing = await imageAdapter.getImage(imageId)
                if (!existing) {
                  throw new Error(
                    '备份缺少图片，无法完整导入，请重新导出备份',
                  )
                }
              }

              // 先预检全部图片，收集本次真正需要新建的图片。
              const newImages: StoredImageEntry[] = []
              for (const image of parsed.images) {
                const existing = await imageAdapter.getImage(image.imageId)
                if (existing) {
                  if (
                    existing.mime !== image.mime ||
                    !sameBytes(existing.bytes, image.bytes)
                  ) {
                    throw new Error(
                      '备份里的图片与现有图片冲突，请先清空数据再导入',
                    )
                  }
                  continue
                }
                newImages.push({
                  imageId: image.imageId,
                  mime: image.mime,
                  bytes: image.bytes,
                })
              }

              // 真正开始覆盖前才快照；校验失败不会产生无意义快照。
              await captureCurrent('before-import')

              if (newImages.length > 0) {
                // 标记先写：中途崩溃时，下次启动能识别并清理未完成导入的图片。
                await adapter.set(PENDING_IMPORT_KEY, {
                  imageIds: newImages.map((image) => image.imageId),
                })
                try {
                  await imageAdapter.putImages(newImages)
                } catch (error) {
                  try {
                    await adapter.remove(PENDING_IMPORT_KEY)
                  } catch {
                    // 标记清理失败会在下次启动时兜底。
                  }
                  throw error
                }
              }

              try {
                await saveAppData(adapter, parsed.data)
              } catch (error) {
                for (const image of newImages) {
                  try {
                    await imageAdapter.deleteImage(image.imageId)
                  } catch {
                    // 回滚尽力而为，留下孤儿图片也不会破图。
                  }
                }
                try {
                  await adapter.remove(PENDING_IMPORT_KEY)
                } catch {
                  // 标记清理失败会在下次启动时兜底。
                }
                throw error
              }

              try {
                await adapter.remove(PENDING_IMPORT_KEY)
              } catch {
                // 标记清理失败会在下次启动时兜底。
              }

              set({
                data: parsed.data,
                todayKey: today,
                status: 'ready',
                error: null,
                recovery: null,
                lastDiscard: null,
              })
              return { status: 'imported' }
            }),
          )
        } catch (error) {
          // 导入是用户主动操作，失败只回报，不切 BootScreen，也不动现有数据。
          return { status: 'error', message: errorMessage(error) }
        }
      },

      clearData: async () => {
        try {
          return await enqueue<ClearDataResult>(() =>
            withDataLock(lockName, async () => {
              await captureCurrent('before-clear')

              const today = clock()
              await clearAppData(adapter, today)
              set({
                data: createEmptyAppData(today),
                todayKey: today,
                status: 'ready',
                error: null,
                recovery: null,
                lastDiscard: null,
              })

              // 主数据已经清空；图片清理失败只提示，快照仍可恢复。
              try {
                await imageAdapter.clearImages()
              } catch (error) {
                return {
                  status: 'error',
                  message: `记录已清空，但图片清理失败：${errorMessage(error)}`,
                }
              }
              return { status: 'cleared' }
            }),
          )
        } catch (error) {
          return { status: 'error', message: errorMessage(error) }
        }
      },

      listSnapshots: async () => {
        try {
          return { status: 'ok', snapshots: await snapshots.list() }
        } catch (error) {
          return { status: 'error', message: errorMessage(error) }
        }
      },

      restoreSnapshot: async (id) => {
        try {
          return await enqueue<RestoreSnapshotResult>(() =>
            withDataLock(lockName, async () => {
              const payload = await snapshots.read(id)
              if (!payload) {
                throw new Error('这份快照已经不存在了')
              }

              const today = clock()
              const data =
                payload.raw === null
                  ? createEmptyAppData(today)
                  : parseAppDataJson(payload.raw, today)

              const before = await captureCurrent('before-restore')
              const beforePayload = await snapshots.read(before.id)

              try {
                await imageAdapter.putImages(payload.images)

                if (
                  payload.raw !== null &&
                  readRawSchemaVersion(payload.raw) === APP_DATA_SCHEMA_VERSION
                ) {
                  // 当前版本原样写回，最大限度保留未知字段。
                  await adapter.setRaw(APP_DATA_STORAGE_KEY, payload.raw)
                } else {
                  await saveAppData(adapter, data)
                }
              } catch (error) {
                if (beforePayload) {
                  try {
                    await imageAdapter.putImages(beforePayload.images)
                  } catch {
                    // 图片回滚失败时仍保留两份快照，下面会返回错误。
                  }
                  try {
                    if (beforePayload.raw !== null) {
                      await adapter.setRaw(
                        APP_DATA_STORAGE_KEY,
                        beforePayload.raw,
                      )
                    } else {
                      await saveAppData(
                        adapter,
                        createEmptyAppData(today),
                      )
                    }
                  } catch {
                    // raw 回滚失败时，原始值仍在 before-restore 快照里。
                  }
                }
                throw error
              }

              set({
                data,
                todayKey: today,
                status: 'ready',
                error: null,
                recovery: null,
                lastDiscard: null,
              })
              return { status: 'restored' }
            }),
          )
        } catch (error) {
          return { status: 'error', message: errorMessage(error) }
        }
      },

      resetAfterRecovery: async () => {
        try {
          return await enqueue<ResetRecoveryResult>(() =>
            withDataLock(lockName, async () => {
              const state = get()
              if (state.status !== 'recovery' || state.recovery === null) {
                throw new Error('当前不在数据恢复模式')
              }

              await snapshots.capture({
                reason: 'before-recovery',
                data: null,
                raw: state.recovery.raw,
              })

              const today = clock()
              const empty = createEmptyAppData(today)
              await saveAppData(adapter, empty)
              set({
                data: empty,
                todayKey: today,
                status: 'ready',
                error: null,
                recovery: null,
                lastDiscard: null,
              })
              return { status: 'reset' }
            }),
          )
        } catch (error) {
          return { status: 'error', message: errorMessage(error) }
        }
      },
    }
  })
}

/** 默认单例：业务代码通过它读写数据，不直接访问 localStorage。 */
export const useAppStore = createAppStore()
