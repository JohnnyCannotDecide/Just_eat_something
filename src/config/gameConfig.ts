import type {
  ActivityLevel,
  CalorieGoal,
  MealType,
  Rarity,
  Sex,
  StampTier,
} from '@/core/types'

/**
 * 所有游戏规则数值的唯一来源。
 * 业务代码不要另写魔法数字；需要调整规则时只改这里。
 */

export const THEME_IDS = ['simple', 'cute', 'vivid'] as const
export type ThemeName = (typeof THEME_IDS)[number]
/** 默认主题；老数据缺字段或值非法时回退到这里。 */
export const DEFAULT_THEME: ThemeName = 'cute'

export function isThemeName(value: unknown): value is ThemeName {
  return (
    typeof value === 'string' &&
    (THEME_IDS as readonly string[]).includes(value)
  )
}

export const RARITY_ORDER = ['R', 'SR', 'SSR', 'UR'] as const satisfies readonly Rarity[]

/** 普通抽卡概率，总和 100。 */
export const RARITY_WEIGHTS: Record<Rarity, number> = {
  R: 55,
  SR: 28,
  SSR: 14,
  UR: 3,
}

export const PITY = {
  /** 连续未出 SR+ 达到该次数后，下一抽必出 SR+。 */
  missThreshold: 5,
  /** 保底时在池内按 RARITY_WEIGHTS 的相对权重抽取。 */
  guaranteedRarities: ['SR', 'SSR', 'UR'] as const satisfies readonly Rarity[],
} as const

export const DRAW_LIMITS = {
  /** 每餐基础抽卡次数。 */
  basePerMeal: 2,
  /** 抽卡券仅当天有效。 */
  tokenValidDays: 1,
} as const

/** 每餐通过广告额外抽卡的次数；null 表示不设上限。 */
export const adExtraDrawsPerMeal: number | null = null

/** 抽卡次数消耗顺序：基础次数 → 抽卡券 → 广告。 */
export const DRAW_SOURCE_ORDER = ['base', 'token', 'ad'] as const

/** 标准份套餐总热量的合理区间；UR 套餐豁免上限。 */
export const mealKcalRange: Record<
  MealType,
  { min: number; max: number }
> = {
  breakfast: { min: 250, max: 600 },
  lunch: { min: 500, max: 900 },
  dinner: { min: 350, max: 800 },
}

export const TOKEN_REWARDS = {
  /** 正式菜品打卡后奖励的抽卡券。 */
  formalDish: 1,
  /** 自定义记录每天仅第一次奖励的抽卡券。 */
  customRecordFirstPerDay: 1,
} as const

/** 部件重抽是否消耗一次抽卡机会并参与保底。 */
export const componentRedrawCostsDraw = true

/** 自制菜谱可选的稀有度；超出范围的数值在归一化时夹回第一项。 */
export const customDishAllowedRarities = [
  'R',
  'SR',
] as const satisfies readonly Rarity[]

/** 时间轴内联印章数量；超出显示 +N。 */
export const STAMP_DISPLAY = { maxInline: 4 } as const

export interface StampTierConfig {
  tier: StampTier
  minCount: number
  label: string
}

/** 同一道菜累计打卡次数决定印章边框：1 铜、3 银、7 金。 */
export const STAMP_TIERS: readonly StampTierConfig[] = [
  { tier: 'bronze', minCount: 1, label: '铜' },
  { tier: 'silver', minCount: 3, label: '银' },
  { tier: 'gold', minCount: 7, label: '金' },
]

export interface StampTierMeta {
  tier: StampTier
}

/**
 * 印章等级元数据；颜色由 [data-tier] + CSS 令牌决定，随主题切换。
 * 与 STAMP_TIERS 的阈值/文案配合使用。
 */
export const STAMP_TIER_META: Record<StampTier, StampTierMeta> = {
  bronze: { tier: 'bronze' },
  silver: { tier: 'silver' },
  gold: { tier: 'gold' },
}

export interface MealConfig {
  type: MealType
  label: string
  emoji: string
}

export const MEALS: readonly MealConfig[] = [
  { type: 'breakfast', label: '早餐', emoji: '🌅' },
  { type: 'lunch', label: '午餐', emoji: '☀️' },
  { type: 'dinner', label: '晚餐', emoji: '🌙' },
]

export const AD = {
  /** MockAdProvider 弹窗倒计时秒数。 */
  mockCountdownSeconds: 5,
} as const

/** Mifflin-St Jeor 公式系数。 */
export const BMR_FORMULA: {
  weightKgFactor: number
  heightCmFactor: number
  ageFactor: number
  sexOffset: Record<Sex, number>
} = {
  weightKgFactor: 10,
  heightCmFactor: 6.25,
  ageFactor: 5,
  sexOffset: { female: -161, male: 5 },
}

export interface ActivityLevelConfig {
  level: ActivityLevel
  label: string
  factor: number
}

export const ACTIVITY_LEVELS: readonly ActivityLevelConfig[] = [
  { level: 'sedentary', label: '久坐少动', factor: 1.2 },
  { level: 'light', label: '轻度活动', factor: 1.375 },
  { level: 'moderate', label: '中度活动', factor: 1.55 },
  { level: 'active', label: '高度活动', factor: 1.725 },
  { level: 'veryActive', label: '非常活跃', factor: 1.9 },
]

/** 目标热量调整：减脂 -15%，维持 0，增肌 +10%。 */
export const GOAL_ADJUSTMENTS: Record<CalorieGoal, number> = {
  cut: -0.15,
  maintain: 0,
  gain: 0.1,
}

export interface GoalMeta {
  goal: CalorieGoal
  label: string
  hint: string
  emoji: string
}

/** 引导页和设置页共用的目标文案。 */
export const GOAL_META: Record<CalorieGoal, GoalMeta> = {
  cut: { goal: 'cut', label: '减脂', hint: '温柔地少吃一点', emoji: '🌿' },
  maintain: { goal: 'maintain', label: '维持', hint: '保持现在的节奏', emoji: '🍚' },
  gain: { goal: 'gain', label: '增肌', hint: '多吃一点，长得结实', emoji: '💪' },
}

/** 目标热量安全下限（kcal）。 */
export const CALORIE_SAFETY_FLOOR: Record<Sex, number> = {
  female: 1200,
  male: 1500,
}

export interface RarityMeta {
  label: Rarity
}

/**
 * 抽卡与图鉴使用的稀有度文案标识。
 * 颜色由 [data-rarity] + CSS 令牌决定，随主题切换。
 */
export const RARITY_META: Record<Rarity, RarityMeta> = {
  R: { label: 'R' },
  SR: { label: 'SR' },
  SSR: { label: 'SSR' },
  UR: { label: 'UR' },
}
