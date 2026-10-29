import { countUnicodeChars } from '@/data/dataRules'

import type {
  ComboCandidateSnapshot,
  DishCategory,
  MealComponentSnapshot,
  MealType,
} from './types'

export const COMBO_NAME_MAX_CHARS = 10
export const COMBO_NAME_FALLBACK = '今日小套餐'

export type ComboNamePart = Pick<
  MealComponentSnapshot,
  'kind' | 'dishId' | 'name' | 'category' | 'discarded'
>

type PartBucket = 'one' | 'two' | 'many'

const CATEGORY_PRIORITY: Record<DishCategory, number> = {
  main: 0,
  staple: 1,
  soup: 2,
  veg: 3,
  snack: 4,
  fruit: 5,
  drink: 6,
}

/** 每餐、每种部件数量的模板池；{hero} 是主角，{side} 是配角。 */
const NAME_TEMPLATES: Record<MealType, Record<PartBucket, readonly string[]>> = {
  breakfast: {
    one: ['{hero}早安', '{hero}开场', '{hero}慢慢吃', '{hero}小早餐'],
    two: ['{hero}和{side}', '{hero}搭{side}', '{hero}配{side}', '{hero}加{side}'],
    many: [
      '{hero}早餐桌',
      '{hero}和{side}们',
      '{hero}满满一桌',
      '{hero}热闹开场',
    ],
  },
  lunch: {
    one: ['{hero}单人餐', '{hero}刚刚好', '{hero}满分餐', '{hero}小食堂'],
    two: ['{hero}和{side}', '{hero}搭{side}', '{hero}配{side}', '{hero}加{side}'],
    many: [
      '{hero}一桌饭',
      '{hero}和{side}们',
      '{hero}满满一桌',
      '{hero}大满足',
    ],
  },
  dinner: {
    one: ['{hero}夜宵', '{hero}小确幸', '{hero}慢慢吃', '{hero}刚刚好'],
    two: ['{hero}和{side}', '{hero}搭{side}', '{hero}配{side}', '{hero}伴{side}'],
    many: ['{hero}一桌菜', '{hero}和{side}们', '{hero}小聚会', '{hero}慢慢吃'],
  },
}

function fnv1a(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** 保留菜名尾部，优先留下“炒蛋 / 鸡汤”这类核心名词。 */
function takeTail(value: string, maxChars: number): string {
  const chars = Array.from(value.trim())
  const budget = Math.max(1, maxChars)
  if (chars.length <= budget) {
    return chars.join('')
  }
  return chars.slice(chars.length - budget).join('')
}

function priorityOf(part: ComboNamePart): number {
  return part.category ? CATEGORY_PRIORITY[part.category] : 7
}

function findHeroIndex(parts: readonly ComboNamePart[]): number {
  let best = 0
  let bestPriority = priorityOf(parts[0]!)
  for (let index = 1; index < parts.length; index += 1) {
    const priority = priorityOf(parts[index]!)
    if (priority < bestPriority) {
      best = index
      bestPriority = priority
    }
  }
  return best
}

function findSideIndex(
  parts: readonly ComboNamePart[],
  heroIndex: number,
): number | null {
  if (parts.length < 2) {
    return null
  }
  let best = -1
  let bestPriority = Number.POSITIVE_INFINITY
  for (let index = 0; index < parts.length; index += 1) {
    if (index === heroIndex) continue
    const priority = priorityOf(parts[index]!)
    if (priority < bestPriority) {
      best = index
      bestPriority = priority
    }
  }
  return best === -1 ? (heroIndex === 0 ? 1 : 0) : best
}

function fillTemplate(
  template: string,
  hero: string,
  side: string,
): string {
  const fixedChars = countUnicodeChars(
    template.replace('{hero}', '').replace('{side}', ''),
  )
  const budget = Math.max(2, COMBO_NAME_MAX_CHARS - fixedChars)
  const hasSide = template.includes('{side}')

  let heroText = takeTail(hero, budget)
  let sideText = ''
  if (hasSide) {
    const heroMax = Math.min(5, Math.max(1, budget - 1))
    heroText = takeTail(hero, heroMax)
    const sideMax = Math.max(
      1,
      budget - countUnicodeChars(heroText),
    )
    sideText = takeTail(side, sideMax)
  }

  const value = template
    .replace('{hero}', heroText)
    .replace('{side}', sideText)
  return countUnicodeChars(value) <= COMBO_NAME_MAX_CHARS
    ? value
    : Array.from(value).slice(0, COMBO_NAME_MAX_CHARS).join('')
}

export function generateComboName(
  parts: readonly ComboNamePart[],
  meal: MealType,
  seed: string,
): string {
  const active = parts.filter(
    (part) => !part.discarded && part.name.trim().length > 0,
  )
  if (active.length === 0) {
    return COMBO_NAME_FALLBACK
  }

  const heroIndex = findHeroIndex(active)
  const sideIndex = findSideIndex(active, heroIndex)
  const bucket: PartBucket =
    active.length === 1 ? 'one' : active.length === 2 ? 'two' : 'many'
  const pool = NAME_TEMPLATES[meal][bucket]
  const template = pool[fnv1a(`${meal}|${seed}|${bucket}`) % pool.length]!

  return fillTemplate(
    template,
    active[heroIndex]!.name,
    sideIndex === null ? '' : active[sideIndex]!.name,
  )
}

function activeNameParts(
  candidate: Pick<ComboCandidateSnapshot, 'components'>,
): ComboNamePart[] {
  return candidate.components.filter((component) => !component.discarded)
}

function isBaseCombination(
  active: readonly ComboNamePart[],
  baseDishIds: readonly string[] | undefined,
): boolean {
  if (!baseDishIds || baseDishIds.length === 0 || active.length === 0) {
    return false
  }
  if (active.some((part) => part.kind === 'custom')) {
    return false
  }

  const activeIds = active.map((part) => part.dishId ?? '')
  if (activeIds.some((id) => id.length === 0)) {
    return false
  }
  return (
    [...activeIds].sort().join('|') === [...baseDishIds].sort().join('|')
  )
}

function nameSeed(
  candidate: Pick<ComboCandidateSnapshot, 'id' | 'components'>,
): string {
  const keys = activeNameParts(candidate)
    .map((part) => {
      if (part.kind === 'dish' && part.dishId) {
        return `dish:${part.dishId}`
      }
      return `custom:${part.name.trim()}`
    })
    .sort()
    .join(',')
  return `${candidate.id}|${keys}`
}

export function resolveCandidateName(
  candidate: ComboCandidateSnapshot,
  meal: MealType,
): string {
  const manual = candidate.manualName?.trim()
  if (manual) {
    return manual
  }

  const active = activeNameParts(candidate)
  const baseName = candidate.baseName?.trim()
  if (baseName && isBaseCombination(active, candidate.baseDishIds)) {
    return baseName
  }

  return generateComboName(active, meal, nameSeed(candidate))
}

/** 部件变化后刷新名字；手动名优先，旧记录/自定义记录保持原样。 */
export function refreshComboName(
  candidate: ComboCandidateSnapshot,
  meal: MealType,
): ComboCandidateSnapshot {
  if (candidate.source !== 'draw') {
    return candidate
  }

  const manual = candidate.manualName?.trim()
  if (manual) {
    return { ...candidate, name: manual, nameSource: 'manual' }
  }

  return {
    ...candidate,
    name: resolveCandidateName(candidate, meal),
    nameSource: 'auto',
  }
}

export function withManualComboName(
  candidate: ComboCandidateSnapshot,
  rawName: string,
): ComboCandidateSnapshot {
  const name = rawName.trim()
  if (name.length === 0) {
    throw new Error('套餐名不能为空')
  }
  if (countUnicodeChars(name) > COMBO_NAME_MAX_CHARS) {
    throw new Error(`套餐名最多 ${COMBO_NAME_MAX_CHARS} 个字`)
  }

  return {
    ...candidate,
    name,
    nameSource: 'manual',
    manualName: name,
  }
}

/** 清除手动名，回到原始组合名或自动生成的名字。 */
export function withAutoComboName(
  candidate: ComboCandidateSnapshot,
  meal: MealType,
): ComboCandidateSnapshot {
  // 旧记录/自定义记录不参与自动命名，恢复时只回到冻结的原名。
  if (candidate.source !== 'draw') {
    const baseName = candidate.baseName?.trim()
    return {
      ...candidate,
      ...(baseName ? { name: baseName } : {}),
      nameSource: 'legacy',
      manualName: undefined,
    }
  }

  const cleared: ComboCandidateSnapshot = {
    ...candidate,
    nameSource: 'auto',
    manualName: undefined,
  }
  return {
    ...cleared,
    name: resolveCandidateName(cleared, meal),
  }
}
