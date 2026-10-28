import { MEALS } from '@/config/gameConfig'
import { calcMealCalories } from '@/core/components'
import { parseDateKey } from '@/core/dateKey'
import { getDrawAllowance, markMealCheckedIn } from '@/core/drawBudget'
import type { DrawAllowance } from '@/core/drawBudget'
import { getMealDayStatus } from '@/core/mealStatus'
import type { MealDayStatus } from '@/core/mealStatus'
import { getStampTier } from '@/core/stamps'
import { isTokenValid } from '@/core/tokens'
import type {
  CookingInfo,
  Dish,
  MealComponentSnapshot,
  MealType,
  Rarity,
  StampDishSnapshot,
  StampTier,
} from '@/core/types'
import { ingredientById } from '@/data'
import {
  createDailyRecord,
  createMealRecord,
} from '@/storage/appData'
import type {
  AppData,
  MealRecord,
  StampRecord,
} from '@/storage/appData'
import type { DiscardReference } from '@/store/useAppStore'

import { getDishEmoji } from '../dishEmoji'
import { isCaloriesVisible } from '../formatKcal'

export type TodayMealStatus = MealDayStatus
export type StampSlot = 'reserved' | 'stamped' | 'custom'

export interface TodayIngredient {
  id: string
  name: string
  grams: number
  kcalPer100g: number
}

export interface TodayComponent {
  id: string
  kind: 'dish' | 'custom'
  origin: 'combo' | 'redraw' | 'manual' | 'custom'
  discarded: boolean
  dishId: string | null
  name: string
  category: MealComponentSnapshot['category']
  rarity: Rarity
  image: string | null
  imageId?: string
  stampImage?: string
  emoji: string
  cooking: CookingInfo | null
  ingredients: TodayIngredient[]
  grams: number | null
  kcal: number | null
  eaten: boolean
  canRedraw: boolean
}

export interface TodayComboCandidate {
  id: string
  comboId: string | null
  name: string
  rarity: Rarity
  tip?: string
  selected: boolean
  components: TodayComponent[]
  activeComponents: TodayComponent[]
  discardedComponents: TodayComponent[]
  kcal: number | null
}

export interface TodayStamp {
  dish: StampDishSnapshot
  count: number
  tier: StampTier
  dateLabel: string
}

export interface TodayMealView {
  type: MealType
  label: string
  emoji: string
  status: TodayMealStatus
  candidates: TodayComboCandidate[]
  selectedCombo: TodayComboCandidate | null
  components: TodayComponent[]
  calories: number | null
  allowance: DrawAllowance
  stamps: TodayStamp[]
  stampSlot: StampSlot
  undoableComponentId: string | null
}

export interface TodayView {
  todayKey: string
  dateLabel: string
  /** 档案存在且用户打开“显示热量”时为 true。 */
  showCalories: boolean
  targetCalories: number | null
  consumedCalories: number
  remainingCalories: number | null
  overCalories: number
  progressPercent: number
  tokenCount: number
  checkedInCount: number
  meals: TodayMealView[]
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const

export function formatDateLabel(dateKey: string): string {
  const parts = parseDateKey(dateKey)
  if (!parts) {
    return dateKey
  }

  const date = new Date(parts.year, parts.month - 1, parts.day)
  return `${parts.month}月${parts.day}日 · ${WEEKDAYS[date.getDay()]}`
}

export function formatShortDate(dateKey: string): string {
  const parts = parseDateKey(dateKey)
  return parts ? `${parts.month}.${parts.day}` : ''
}

/** 图鉴仍以实时菜品库展示标准食材；今日页改用快照。 */
export function toIngredientRows(dish: Dish): TodayIngredient[] {
  return dish.ingredients.map((item) => {
    const ingredient = ingredientById.get(item.ingredientId)
    return {
      id: item.ingredientId,
      name: ingredient?.name ?? item.ingredientId,
      grams: item.grams,
      kcalPer100g: ingredient?.kcalPer100g ?? 0,
    }
  })
}

function toComponent(
  component: MealComponentSnapshot,
  checkedIn: boolean,
): TodayComponent {
  return {
    id: component.id,
    kind: component.kind,
    origin: component.origin,
    discarded: component.discarded,
    dishId: component.dishId,
    name: component.name,
    category: component.category,
    rarity: component.rarity,
    image: component.image,
    ...(component.imageId ? { imageId: component.imageId } : {}),
    ...(component.stampImage ? { stampImage: component.stampImage } : {}),
    emoji:
      component.emoji ??
      (component.kind === 'custom'
        ? '🍽️'
        : getDishEmoji(component.dishId ?? component.id)),
    cooking: component.cooking,
    ingredients: component.ingredients.map((item, index) => ({
      id: item.ingredientId ?? String(index),
      name: item.name,
      grams: item.grams,
      kcalPer100g: item.kcalPer100g,
    })),
    grams: component.grams,
    kcal: component.calories,
    eaten: component.eaten,
    canRedraw:
      !checkedIn &&
      component.kind === 'dish' &&
      component.category !== null &&
      !component.discarded,
  }
}

function toCandidate(
  candidate: MealRecord['candidateCombos'][number],
  selectedId: string | null,
  checkedIn: boolean,
): TodayComboCandidate {
  const components = candidate.components.map((component) =>
    toComponent(component, checkedIn),
  )

  return {
    id: candidate.id,
    comboId: candidate.comboId,
    name: candidate.name,
    rarity: candidate.rarity,
    ...(candidate.tip ? { tip: candidate.tip } : {}),
    selected: candidate.id === selectedId,
    components,
    activeComponents: components.filter((component) => !component.discarded),
    discardedComponents: components.filter((component) => component.discarded),
    kcal: calcMealCalories(candidate.components),
  }
}

function buildStamps(
  candidate: TodayComboCandidate | null,
  checkedIn: boolean,
  stamps: Record<string, StampRecord>,
): TodayStamp[] {
  if (!checkedIn || !candidate) {
    return []
  }

  const result: TodayStamp[] = []
  const seen = new Set<string>()

  for (const component of candidate.components) {
    if (
      component.kind !== 'dish' ||
      component.discarded ||
      !component.eaten ||
      component.dishId === null ||
      seen.has(component.dishId)
    ) {
      continue
    }
    const record = stamps[component.dishId]
    const tier = record ? getStampTier(record.checkInCount) : null
    if (!record || !tier) {
      continue
    }

    seen.add(component.dishId)
    const latestDate = record.checkInDates.at(-1) ?? record.firstCheckInDate
    result.push({
      dish: {
        id: component.dishId,
        name: component.name,
        rarity: component.rarity,
        ...(component.image ? { image: component.image } : {}),
        ...(component.imageId ? { imageId: component.imageId } : {}),
        ...(component.emoji ? { emoji: component.emoji } : {}),
        ...(component.stampImage
          ? { stampImage: component.stampImage }
          : {}),
      },
      count: record.checkInCount,
      tier,
      dateLabel: formatShortDate(latestDate),
    })
  }

  return result
}

function buildMeal(
  type: MealType,
  label: string,
  emoji: string,
  record: MealRecord,
  tokenCount: number,
  stamps: Record<string, StampRecord>,
  todayKey: string,
  lastDiscard: DiscardReference | null | undefined,
): TodayMealView {
  const checkedIn = record.budget.checkedIn
  const candidates = record.candidateCombos.map((candidate) =>
    toCandidate(candidate, record.selectedCandidateId, checkedIn),
  )
  const selectedRecord =
    record.candidateCombos.find(
      (candidate) => candidate.id === record.selectedCandidateId,
    ) ?? null
  const selectedCombo =
    candidates.find((candidate) => candidate.id === record.selectedCandidateId) ??
    null
  const components = selectedCombo?.components ?? []
  const status: TodayMealStatus = getMealDayStatus(record)
  const calories = checkedIn
    ? record.calories
    : selectedRecord
      ? calcMealCalories(selectedRecord.components)
      : null
  const mealStamps = buildStamps(selectedCombo, checkedIn, stamps)
  const stampSlot: StampSlot =
    mealStamps.length > 0
      ? 'stamped'
      : checkedIn &&
          components.some(
            (component) =>
              component.kind === 'custom' &&
              component.eaten &&
              !component.discarded,
          )
        ? 'custom'
        : 'reserved'
  const undoableComponentId =
    !checkedIn &&
    lastDiscard &&
    lastDiscard.dateKey === todayKey &&
    lastDiscard.meal === type &&
    lastDiscard.candidateId === selectedCombo?.id &&
    components.some(
      (component) =>
        component.id === lastDiscard.componentId && component.discarded,
    )
      ? lastDiscard.componentId
      : null

  return {
    type,
    label,
    emoji,
    status,
    candidates,
    selectedCombo,
    components,
    calories,
    allowance: getDrawAllowance(
      checkedIn ? markMealCheckedIn(record.budget) : record.budget,
      tokenCount,
    ),
    stamps: mealStamps,
    stampSlot,
    undoableComponentId,
  }
}

export function buildTodayView(
  data: AppData,
  todayKey: string,
  lastDiscard?: DiscardReference | null,
): TodayView {
  const day = data.days[todayKey] ?? createDailyRecord(todayKey)
  const tokenCount = isTokenValid(day.tokens, todayKey)
    ? Math.max(0, Math.floor(day.tokens.count))
    : 0

  const meals = MEALS.map((meal) =>
    buildMeal(
      meal.type,
      meal.label,
      meal.emoji,
      day.meals[meal.type] ?? createMealRecord(),
      tokenCount,
      data.stamps,
      todayKey,
      lastDiscard,
    ),
  )

  const consumedCalories = meals.reduce(
    (sum, meal) =>
      meal.status === 'checkedIn' ? sum + (meal.calories ?? 0) : sum,
    0,
  )
  const targetCalories = data.targetCalories
  const remainingCalories =
    targetCalories === null ? null : targetCalories - consumedCalories
  const overCalories =
    targetCalories === null
      ? 0
      : Math.max(0, consumedCalories - targetCalories)
  const progressPercent =
    targetCalories !== null && targetCalories > 0
      ? Math.min(
          100,
          Math.round((consumedCalories / targetCalories) * 100),
        )
      : 0

  return {
    todayKey,
    dateLabel: formatDateLabel(todayKey),
    showCalories: isCaloriesVisible(
      data.profile,
      data.settings.showCalories,
    ),
    targetCalories,
    consumedCalories,
    remainingCalories,
    overCalories,
    progressPercent,
    tokenCount,
    checkedInCount: meals.filter((meal) => meal.status === 'checkedIn').length,
    meals,
  }
}
