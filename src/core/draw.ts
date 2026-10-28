import { PITY, RARITY_ORDER, RARITY_WEIGHTS } from '@/config/gameConfig'
import { combos as defaultComboCatalog } from '@/data'

import type { Combo, MealType, Rarity } from './types'

export type Rng = () => number

export interface RarityCandidate {
  rarity: Rarity
}

interface RarityBucket<T extends RarityCandidate> {
  rarity: Rarity
  weight: number
  items: T[]
}

export interface RarityDrawResult<T> {
  item: T
  pityTriggered: boolean
  pityCount: number
}

/** strict 模式下保底触发但池内没有 SR+ 时抛出，供调用方在消耗次数前处理。 */
export class PityUnavailableError extends Error {
  constructor() {
    super('保底没有可用的 SR+ 候选')
    this.name = 'PityUnavailableError'
  }
}

function normalizeCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
}

function isGuaranteedRarity(rarity: Rarity): boolean {
  return PITY.guaranteedRarities.some((item) => item === rarity)
}

function readRandom(rng: Rng): number {
  const value = rng()
  if (!Number.isFinite(value)) {
    throw new RangeError(`rng 必须返回有限数，收到: ${String(value)}`)
  }
  return Math.min(1, Math.max(0, value))
}

function pickBucket<T extends RarityCandidate>(
  buckets: readonly RarityBucket<T>[],
  random: number,
): RarityBucket<T> {
  const totalWeight = buckets.reduce((sum, bucket) => sum + bucket.weight, 0)
  const target = random * totalWeight
  let cursor = 0

  for (const bucket of buckets) {
    cursor += bucket.weight
    if (target < cursor) {
      return bucket
    }
  }

  // random === 1 时落到最后一个可用桶。
  return buckets[buckets.length - 1]!
}

/**
 * 按稀有度权重抽一个候选。每次成功恰好读取两次 rng：
 * 先稀有度，再同稀有度内的条目。
 *
 * - fallback：保底触发但无 SR+ 时退回普通权重。
 * - strict：保底触发但无 SR+ 时抛 PityUnavailableError。
 */
export function drawByRarity<T extends RarityCandidate>(
  items: readonly T[],
  pityCount: number,
  rng: Rng = Math.random,
  mode: 'fallback' | 'strict' = 'fallback',
): RarityDrawResult<T> {
  const buckets: RarityBucket<T>[] = RARITY_ORDER.map((rarity) => ({
    rarity,
    weight: RARITY_WEIGHTS[rarity],
    items: items.filter((item) => item.rarity === rarity),
  })).filter((bucket) => bucket.items.length > 0)

  if (buckets.length === 0) {
    throw new Error('候选池已抽空，无法继续抽卡')
  }

  const normalizedPity = normalizeCount(pityCount)
  const pityActive = normalizedPity >= PITY.missThreshold
  const guaranteedBuckets = buckets.filter((bucket) =>
    isGuaranteedRarity(bucket.rarity),
  )

  if (pityActive && guaranteedBuckets.length === 0 && mode === 'strict') {
    throw new PityUnavailableError()
  }

  const usePity = pityActive && guaranteedBuckets.length > 0
  const candidates = usePity ? guaranteedBuckets : buckets

  const rarityRandom = readRandom(rng)
  const selectedBucket = pickBucket(candidates, rarityRandom)
  const itemRandom = readRandom(rng)
  const itemIndex = Math.min(
    selectedBucket.items.length - 1,
    Math.floor(itemRandom * selectedBucket.items.length),
  )
  const item = selectedBucket.items[itemIndex]!

  const hitGuaranteed = isGuaranteedRarity(selectedBucket.rarity)

  return {
    item,
    pityTriggered: usePity && hitGuaranteed,
    pityCount: hitGuaranteed ? 0 : normalizedPity + 1,
  }
}

export interface ComboDrawState {
  /** 连续未出 SR+ 的次数；全局计数，跨餐/跨天由调用方持久化。 */
  pityCount: number
  /** 当前这一餐已抽到的套餐 id；换餐时重置。 */
  drawnComboIds: readonly string[]
}

export interface ComboDrawResult {
  combo: Combo
  pityCount: number
  pityTriggered: boolean
}

export function createComboDrawState(pityCount = 0): ComboDrawState {
  return { pityCount: normalizeCount(pityCount), drawnComboIds: [] }
}

/** 换餐时清空本餐已抽记录，保底进度保留。 */
export function resetComboDraws(state: ComboDrawState): ComboDrawState {
  return {
    pityCount: normalizeCount(state.pityCount),
    drawnComboIds: [],
  }
}

/**
 * 抽一个当前餐次的套餐。同一餐已抽过的套餐不会再次出现；
 * 保底进度跨餐保留，保底触发但无 SR+ 时退回普通权重。
 */
export function drawCombo(
  state: ComboDrawState,
  meal: MealType,
  rng: Rng = Math.random,
  catalog: readonly Combo[] = defaultComboCatalog,
): ComboDrawResult {
  const drawn = new Set(state.drawnComboIds)
  const candidates = catalog.filter(
    (combo) => combo.meals.includes(meal) && !drawn.has(combo.id),
  )

  if (candidates.length === 0) {
    throw new Error('候选套餐已抽完，无法继续抽卡')
  }

  const draw = drawByRarity(candidates, state.pityCount, rng, 'fallback')
  return {
    combo: draw.item,
    pityCount: draw.pityCount,
    pityTriggered: draw.pityTriggered,
  }
}
