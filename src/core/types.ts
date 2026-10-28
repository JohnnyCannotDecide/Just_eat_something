export type Rarity = 'R' | 'SR' | 'SSR' | 'UR'

export type MealType = 'breakfast' | 'lunch' | 'dinner'

export type DishCategory =
  | 'staple'
  | 'main'
  | 'soup'
  | 'drink'
  | 'veg'
  | 'fruit'
  | 'snack'

export type CookingMethod =
  | '蒸'
  | '煮'
  | '炒'
  | '拌'
  | '烤'
  | '煎'
  | '炖'
  | '冲泡'
  | '免煮'
  | '外买'

export interface CookingInfo {
  method: CookingMethod
  timeMinutes: number
  steps: string[]
  tips?: string
}

export type StampTier = 'bronze' | 'silver' | 'gold'

export type Sex = 'female' | 'male'

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'veryActive'

export type CalorieGoal = 'cut' | 'maintain' | 'gain'

export interface Ingredient {
  id: string
  name: string
  /** 每 100g 热量（近似值，需人工校对） */
  kcalPer100g: number
}

export interface DishIngredient {
  ingredientId: string
  grams: number
}

export interface Dish {
  id: string
  name: string
  rarity: Rarity
  category: DishCategory
  meals: MealType[]
  ingredients: DishIngredient[]
  /** 官方菜的图片路径；自制菜为空字符串，改用 imageId / emoji。 */
  image: string
  /** 自制菜上传图片的 IndexedDB 键；官方菜不写。 */
  imageId?: string
  /** 自制菜自选的图标，没上传图片时展示。 */
  emoji?: string
  /** 若存在则优先作为印章图 */
  stampImage?: string
  /** 一句可爱的描述 */
  tip?: string
  /** 官方菜必填；自制菜可以没有做法。 */
  cooking: CookingInfo | null
  /** 运行时自制菜标记；官方菜不写这两个字段。 */
  isCustom?: boolean
  archived?: boolean
  /**
   * 运行时自制菜字段：食材详情快照。
   * 自制菜的食材可能不在官方食材表里，组件构建直接用它。
   */
  ingredientDetails?: ComponentIngredientSnapshot[]
  /** 运行时自制菜字段：直接热量模式下的总热量。 */
  calories?: number | null
}

export type CalorieMode = 'ingredients' | 'total'

/** 用户自建的食材；选中后作为菜谱食材行的来源。 */
export interface CustomIngredient {
  id: string
  name: string
  kcalPer100g: number
}

/** 自制菜谱的一行食材；ingredientId 为空表示只记了名称与热量。 */
export interface CustomDishIngredientRow {
  ingredientId?: string
  name: string
  kcalPer100g: number
  grams: number
}

/** 用户自建的菜谱；主数据只存 imageId，图片本身在 IndexedDB。 */
export interface CustomDish {
  /** custom_dish:<uuid>，与官方菜 id 天然隔离。 */
  id: string
  name: string
  imageId: string | null
  /** 未上传图片时的兜底图标。 */
  emoji: string | null
  category: DishCategory
  meals: MealType[]
  rarity: Rarity
  ingredientRows: CustomDishIngredientRow[]
  calorieMode: CalorieMode
  /** total 模式手填的热量；ingredients 模式为 null。 */
  calories: number | null
  cooking: CookingInfo | null
  /** 是否进入抽卡池；归档后强制为 false。 */
  includeInPool: boolean
  archived: boolean
  /** YYYY-MM-DD，图鉴排序用。 */
  createdAt: string
}

export interface Combo {
  id: string
  name: string
  /** 运行时模型：已解析出的最终稀有度；JSON 中该字段仍可省略。 */
  rarity: Rarity
  meals: MealType[]
  components: string[]
  tip?: string
}

export type ComponentKind = 'dish' | 'custom'
export type ComponentOrigin = 'combo' | 'redraw' | 'manual' | 'custom'
export type ComboSource = 'draw' | 'legacy' | 'customRecord'

export interface ComponentIngredientSnapshot {
  ingredientId?: string
  name: string
  kcalPer100g: number
  grams: number
}

/** 套餐内一个可编辑/可勾选的部件快照；历史记录不依赖实时菜品库。 */
export interface MealComponentSnapshot {
  id: string
  kind: ComponentKind
  origin: ComponentOrigin
  dishId: string | null
  name: string
  category: DishCategory | null
  rarity: Rarity
  image: string | null
  /** 自制菜图片的 IndexedDB 键；渲染时优先于 image。 */
  imageId?: string
  /** 自制菜图标，图片缺失/未上传时展示。 */
  emoji?: string
  stampImage?: string
  tip?: string
  cooking: CookingInfo | null
  ingredients: ComponentIngredientSnapshot[]
  /** 汇总克数；自定义记录/无食材占位为 null。 */
  grams: number | null
  calories: number | null
  eaten: boolean
  /** 已舍弃：保留快照供展示/撤销，但不参与结算。 */
  discarded: boolean
}

export interface ComboCandidateSnapshot {
  id: string
  comboId: string | null
  source: ComboSource
  name: string
  rarity: Rarity
  tip?: string
  components: MealComponentSnapshot[]
}

/** 印章只需要展示字段；历史印章不依赖实时菜品库。 */
export interface StampDishSnapshot {
  id: string
  name: string
  rarity: Rarity
  image?: string
  /** 自制菜图片的 IndexedDB 键。 */
  imageId?: string
  /** 自制菜图标；历史印章不依赖菜品库。 */
  emoji?: string
  stampImage?: string
}

export interface BodyProfile {
  sex: Sex
  age: number
  heightCm: number
  weightKg: number
  activity: ActivityLevel
  goal: CalorieGoal
  /** 用户手动覆盖的目标热量；留空则按公式计算 */
  manualTargetKcal?: number
}
