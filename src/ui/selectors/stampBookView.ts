import {
  CUSTOM_DISH_FALLBACK_EMOJI,
  calcCustomDishCalories,
} from '@/core/customDish'
import {
  getStampProgress,
  getStampTierLabel,
} from '@/core/stamps'
import type {
  CookingInfo,
  CustomDish,
  Dish,
  DishCategory,
  Rarity,
  StampTier,
} from '@/core/types'
import { calcDishCalories } from '@/core/nutrition'
import { dishes } from '@/data'
import type { StampRecord } from '@/storage/appData'

import { getDishEmoji } from '../dishEmoji'
import {
  formatDateLabel,
  formatShortDate,
  toIngredientRows,
} from './todayView'
import type { TodayIngredient } from './todayView'

/** 全部 = 官方 + 自制；已收集只看官方进度；自制只看自制菜谱。 */
export type StampBookFilter = 'all' | 'collected' | 'custom'

export interface StampBookEntry {
  id: string
  name: string
  rarity: Rarity
  category: DishCategory
  emoji: string
  image: string
  imageId?: string
  stampImage?: string
  /** 自制菜可能没填热量，此时为 null。 */
  kcal: number | null
  tip?: string
  ingredients: TodayIngredient[]
  cooking: CookingInfo | null
  isCustom: boolean
  archived: boolean
  /** 未收集的官方菜：名称与全部内容已在 selector 层抹除。 */
  masked: boolean

  collected: boolean
  count: number
  tier: StampTier | null
  tierLabel: string | null
  nextTier: StampTier | null
  remainingToNext: number | null

  firstCheckInDate: string
  firstCheckInLabel: string
  latestCheckInDate: string
  dateLabel: string
}

export interface StampBookView {
  entries: StampBookEntry[]
  /** 官方图鉴进度：只统计官方菜。 */
  collected: number
  total: number
  percent: number
  /** 自制菜谱单独计数，包含已归档。 */
  customTotal: number
  customCollected: number
}

export interface StampBookInput {
  stamps?: Record<string, StampRecord>
  customDishes?: readonly CustomDish[]
}

function normalizeCount(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return 0
  }
  return Math.max(0, Math.floor(value))
}

interface StampProgressFields {
  collected: boolean
  count: number
  tier: StampTier | null
  tierLabel: string | null
  nextTier: StampTier | null
  remainingToNext: number | null
  firstCheckInDate: string
  firstCheckInLabel: string
  latestCheckInDate: string
  dateLabel: string
}

function buildProgress(record: StampRecord | undefined): StampProgressFields {
  const count = normalizeCount(record?.checkInCount)
  const progress = getStampProgress(count)
  const collected = progress.tier !== null
  const firstCheckInDate = collected
    ? (record?.firstCheckInDate ?? '')
    : ''
  const latestCheckInDate = collected
    ? (record?.checkInDates.at(-1) ?? firstCheckInDate)
    : ''

  return {
    collected,
    count,
    tier: progress.tier,
    tierLabel: progress.tier
      ? getStampTierLabel(progress.tier)
      : null,
    nextTier: progress.nextTier,
    remainingToNext: progress.remaining,
    firstCheckInDate,
    firstCheckInLabel: firstCheckInDate
      ? formatDateLabel(firstCheckInDate)
      : '',
    latestCheckInDate,
    dateLabel: latestCheckInDate
      ? formatShortDate(latestCheckInDate)
      : '',
  }
}

function buildOfficialEntry(
  dish: Dish,
  record: StampRecord | undefined,
): StampBookEntry {
  const progress = buildProgress(record)
  if (!progress.collected) {
    // 未收集：不把名称、图片、食材、做法、热量带进视图，UI 无从泄露。
    return {
      id: dish.id,
      name: '???',
      rarity: dish.rarity,
      category: dish.category,
      emoji: '',
      image: '',
      kcal: null,
      ingredients: [],
      cooking: null,
      isCustom: false,
      archived: false,
      masked: true,
      ...progress,
    }
  }

  return {
    id: dish.id,
    name: dish.name,
    rarity: dish.rarity,
    category: dish.category,
    emoji: getDishEmoji(dish.id),
    image: dish.image,
    ...(dish.imageId ? { imageId: dish.imageId } : {}),
    ...(dish.stampImage ? { stampImage: dish.stampImage } : {}),
    kcal: calcDishCalories(dish),
    ...(dish.tip ? { tip: dish.tip } : {}),
    ingredients: toIngredientRows(dish),
    cooking: dish.cooking,
    isCustom: false,
    archived: false,
    masked: false,
    ...progress,
  }
}

function buildCustomEntry(
  dish: CustomDish,
  record: StampRecord | undefined,
): StampBookEntry {
  return {
    id: dish.id,
    name: dish.name,
    rarity: dish.rarity,
    category: dish.category,
    emoji: dish.emoji ?? CUSTOM_DISH_FALLBACK_EMOJI,
    image: '',
    ...(dish.imageId ? { imageId: dish.imageId } : {}),
    kcal: calcCustomDishCalories(dish),
    ingredients: dish.ingredientRows.map((row, index) => ({
      id: row.ingredientId ?? `${dish.id}:ingredient:${index + 1}`,
      name: row.name,
      grams: row.grams,
      kcalPer100g: row.kcalPer100g,
    })),
    cooking: dish.cooking,
    isCustom: true,
    archived: dish.archived,
    masked: false,
    ...buildProgress(record),
  }
}

/**
 * 图鉴视图。
 * - 官方进度永远只数官方菜，自制菜单独计数（含归档）。
 * - `collected` 筛选只列官方已收集；自制菜统一在 `custom` 筛选里查看。
 */
export function buildStampBookView(
  input: StampBookInput,
  filter: StampBookFilter = 'all',
  dishSource: readonly Dish[] = dishes,
  query = '',
): StampBookView {
  const stamps = input.stamps ?? {}
  const officialEntries = dishSource.map((dish) =>
    buildOfficialEntry(dish, stamps[dish.id]),
  )
  const customEntries = (input.customDishes ?? []).map((dish) =>
    buildCustomEntry(dish, stamps[dish.id]),
  )

  const collected = officialEntries.filter((entry) => entry.collected).length
  const total = officialEntries.length
  const customCollected = customEntries.filter(
    (entry) => entry.collected,
  ).length

  let entries: StampBookEntry[]
  switch (filter) {
    case 'collected':
      entries = officialEntries.filter((entry) => entry.collected)
      break
    case 'custom':
      entries = customEntries
      break
    default:
      entries = [...officialEntries, ...customEntries]
      break
  }

  const keyword = query.trim().toLowerCase()
  if (keyword.length > 0) {
    // 未收集官方菜不参与搜索；masked 名称已是 ???，双重兜底。
    entries = entries.filter(
      (entry) =>
        (entry.isCustom || entry.collected) &&
        entry.name.toLowerCase().includes(keyword),
    )
  }

  return {
    entries,
    collected,
    total,
    percent: total > 0 ? Math.round((collected / total) * 100) : 0,
    customTotal: customEntries.length,
    customCollected,
  }
}
