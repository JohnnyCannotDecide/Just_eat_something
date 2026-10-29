import { PITY, RARITY_ORDER, RARITY_WEIGHTS } from '@/config/gameConfig'

import type { Rarity } from './types'

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
 * 先稀有度，再同稀有度内的条目。保底触发但无 SR+ 时退回普通权重，
 * 保底计数不清零，按普通规则继续累计。
 */
export function drawByRarity<T extends RarityCandidate>(
  items: readonly T[],
  pityCount: number,
  rng: Rng = Math.random,
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
