#!/usr/bin/env node
/**
 * 仅开发环境使用的演示数据生成器。
 *
 * 生成一个可以直接导入应用（设置 → 导入备份）的 schemaVersion = 5 JSON：
 * 最近 N 天（默认 45 天）的三餐快照、印章与档案。
 *
 * 只依赖 Node 内置模块；不导入 src，构建产物也不会包含它。
 *
 * 用法：
 *   node scripts/seed-demo-data.mjs
 *   node scripts/seed-demo-data.mjs --days 45 --today 2026-10-29 --out .local/demo.json
 *   node scripts/seed-demo-data.mjs --stdout
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const RARITY_ORDER = ['R', 'SR', 'SSR', 'UR']
const MEAL_TYPES = ['breakfast', 'lunch', 'dinner']
const GAP_OFFSETS = new Set([6, 11, 15, 25, 30, 35, 40])
const FULL_ATTENDANCE_OFFSETS = new Set([2, 5, 7, 10, 16, 20, 33])
const DEFAULTS = {
  days: 45,
  seed: 20261029,
  out: '.local/seed-demo-data.json',
  stdout: false,
}

/**
 * 演示数据只属于开发环境。脚本本身不写浏览器存储（只输出文件），
 * 这个命名空间用于标记来源，避免被误当成正式数据。
 */
export const SEED_NAMESPACE = 'dev_diet-diary:'

const SEED_WARNING =
  '仅开发用：导入会覆盖应用里的当前数据（导入前会自动创建快照）。\n'

function readJson(relativePath) {
  return JSON.parse(
    readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8'),
  )
}

const ingredients = readJson('src/data/ingredients.json').ingredients
const dishes = readJson('src/data/dishes.json').dishes
const combos = readJson('src/data/combos.json').combos

const ingredientById = new Map(
  ingredients.map((ingredient) => [ingredient.id, ingredient]),
)
const dishById = new Map(dishes.map((dish) => [dish.id, dish]))
const combosByMeal = new Map(
  MEAL_TYPES.map((meal) => [
    meal,
    combos.filter((combo) => combo.meals.includes(meal)),
  ]),
)

function toDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDateKey(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) {
    return null
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  return { year, month, day }
}

function shiftDateKey(dateKey, offsetDays) {
  const parts = parseDateKey(dateKey)
  if (!parts) {
    throw new Error(`无效日期: ${dateKey}`)
  }
  const date = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + offsetDays),
  )
  return `${String(date.getUTCFullYear()).padStart(4, '0')}-${String(
    date.getUTCMonth() + 1,
  ).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function createRng(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function round1(value) {
  return Math.round(value * 10) / 10
}

function calcComponentsCalories(components) {
  let total = 0
  let hasValue = false
  for (const component of components) {
    if (component.discarded || !component.eaten || component.calories === null) {
      continue
    }
    total += component.calories
    hasValue = true
  }
  return hasValue ? Math.round(total) : null
}

function resolveComboRarity(combo) {
  if (combo.rarity) {
    return combo.rarity
  }
  let best = 'R'
  for (const dishId of combo.components) {
    const dish = dishById.get(dishId)
    if (
      dish &&
      RARITY_ORDER.indexOf(dish.rarity) > RARITY_ORDER.indexOf(best)
    ) {
      best = dish.rarity
    }
  }
  return best
}

function buildDishComponent(dish, id, eaten) {
  const ingredientRows = dish.ingredients.map((item) => {
    const ingredient = ingredientById.get(item.ingredientId)
    return {
      ingredientId: item.ingredientId,
      name: ingredient?.name ?? item.ingredientId,
      kcalPer100g: ingredient?.kcalPer100g ?? 0,
      grams: item.grams,
    }
  })
  const grams =
    ingredientRows.length === 0
      ? null
      : round1(
          ingredientRows.reduce((total, item) => total + item.grams, 0),
        )
  const calories =
    ingredientRows.length === 0
      ? null
      : Math.round(
          ingredientRows.reduce(
            (total, item) => total + (item.kcalPer100g * item.grams) / 100,
            0,
          ),
        )

  return {
    id,
    kind: 'dish',
    origin: 'combo',
    dishId: dish.id,
    name: dish.name,
    category: dish.category,
    rarity: dish.rarity,
    image: dish.image ?? null,
    ...(dish.stampImage ? { stampImage: dish.stampImage } : {}),
    ...(dish.tip ? { tip: dish.tip } : {}),
    cooking: {
      method: dish.cooking.method,
      timeMinutes: dish.cooking.timeMinutes,
      steps: [...dish.cooking.steps],
      ...(dish.cooking.tips ? { tips: dish.cooking.tips } : {}),
    },
    ingredients: ingredientRows,
    grams,
    calories,
    eaten,
    discarded: false,
  }
}

function buildCustomComponent(id, name, calories) {
  return {
    id,
    kind: 'custom',
    origin: 'custom',
    dishId: null,
    name,
    category: null,
    rarity: 'R',
    image: null,
    cooking: null,
    ingredients: [],
    grams: null,
    calories,
    eaten: true,
    discarded: false,
  }
}

function buildGhostComponent(id) {
  return {
    id,
    kind: 'dish',
    origin: 'manual',
    dishId: 'ghost_archived_dish',
    name: '旧菜单的南瓜派',
    category: 'snack',
    rarity: 'R',
    image: null,
    cooking: null,
    ingredients: [{ name: '南瓜', kcalPer100g: 26, grams: 180 }],
    grams: 180,
    calories: 47,
    eaten: true,
    discarded: false,
  }
}

function pickCombo(meal, rng) {
  const pool = combosByMeal.get(meal) ?? []
  if (pool.length === 0) {
    throw new Error(`没有适用于 ${meal} 的套餐`)
  }
  return pool[Math.floor(rng() * pool.length)]
}

function buildCandidate(combo, dateKey, meal, rng, options = {}) {
  const candidateId = `seed:${dateKey}:${meal}:${combo.id}`
  const components = combo.components.flatMap((dishId, index) => {
    const dish = dishById.get(dishId)
    if (!dish) {
      return []
    }
    const eaten = options.allEaten ? true : rng() < 0.86
    return [
      buildDishComponent(
        dish,
        `${candidateId}:${index}`,
        eaten,
      ),
    ]
  })

  if (options.custom) {
    components.push(
      buildCustomComponent(
        `${candidateId}:custom`,
        options.custom.name,
        options.custom.calories,
      ),
    )
  }
  if (options.ghost) {
    components.push(buildGhostComponent(`${candidateId}:ghost`))
  }
  if (components.length > 0 && !components.some((component) => component.eaten)) {
    components[0].eaten = true
  }
  if (options.leaveUneaten && components.length > 1) {
    components[1].eaten = false
  }

  return {
    id: candidateId,
    comboId: combo.id,
    source: 'draw',
    name: combo.name,
    nameSource: 'auto',
    baseName: combo.name,
    baseDishIds: [...combo.components],
    rarity: resolveComboRarity(combo),
    ...(combo.tip ? { tip: combo.tip } : {}),
    components,
  }
}

function emptyMeal() {
  return {
    candidateCombos: [],
    selectedCandidateId: null,
    calories: null,
    budget: { baseUsed: 0, adUsed: 0, checkedIn: false },
  }
}

function drawnMeal(dateKey, meal, rng) {
  const candidate = buildCandidate(pickCombo(meal, rng), dateKey, meal, rng)
  return {
    candidateCombos: [candidate],
    selectedCandidateId: candidate.id,
    calories: null,
    budget: { baseUsed: 1, adUsed: 0, checkedIn: false },
  }
}

function checkedInMeal(dateKey, meal, rng, options = {}) {
  const candidate = buildCandidate(
    pickCombo(meal, rng),
    dateKey,
    meal,
    rng,
    options,
  )
  return {
    candidateCombos: [candidate],
    selectedCandidateId: candidate.id,
    calories: calcComponentsCalories(candidate.components),
    budget: { baseUsed: 1, adUsed: 0, checkedIn: true },
  }
}

function customOnlyMeal(dateKey, meal, name, calories) {
  const candidate = {
    id: `seed:${dateKey}:${meal}:custom`,
    comboId: null,
    source: 'customRecord',
    name,
    nameSource: 'manual',
    manualName: name,
    baseName: name,
    baseDishIds: [],
    rarity: 'R',
    components: [
      buildCustomComponent(
        `seed:${dateKey}:${meal}:custom:component`,
        name,
        calories,
      ),
    ],
  }
  return {
    candidateCombos: [candidate],
    selectedCandidateId: candidate.id,
    calories,
    budget: { baseUsed: 0, adUsed: 0, checkedIn: true },
  }
}

function shuffle(values, rng) {
  const result = [...values]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1))
    ;[result[index], result[swap]] = [result[swap], result[index]]
  }
  return result
}

function buildDay(dateKey, offset, rng) {
  if (GAP_OFFSETS.has(offset)) {
    return null
  }

  const meals = {
    breakfast: emptyMeal(),
    lunch: emptyMeal(),
    dinner: emptyMeal(),
  }

  if (offset === 0) {
    // 今天：早餐已打卡、午餐已抽未打卡、晚餐未抽。
    meals.breakfast = checkedInMeal(dateKey, 'breakfast', rng, {
      allEaten: true,
    })
    meals.lunch = drawnMeal(dateKey, 'lunch', rng)
  } else if (FULL_ATTENDANCE_OFFSETS.has(offset)) {
    for (const meal of MEAL_TYPES) {
      meals[meal] = checkedInMeal(dateKey, meal, rng, {
        allEaten: true,
        leaveUneaten: offset === 2 && meal === 'lunch',
        ghost: offset === 10 && meal === 'dinner',
      })
    }
  } else if (offset === 1 || offset === 3 || offset === 12 || offset === 17 || offset === 18) {
    meals.breakfast = checkedInMeal(dateKey, 'breakfast', rng)
    meals.lunch = checkedInMeal(dateKey, 'lunch', rng)
  } else if (offset === 4) {
    meals.dinner = customOnlyMeal(dateKey, 'dinner', '和朋友聚餐', 800)
  } else if (offset === 8) {
    // 库内部件 + 一条无热量自定义记录：当日合计仍有数值。
    meals.dinner = checkedInMeal(dateKey, 'dinner', rng, {
      custom: { name: '饭后小甜点', calories: null },
    })
  } else if (offset === 9) {
    meals.lunch = drawnMeal(dateKey, 'lunch', rng)
  } else if (offset === 13) {
    meals.lunch = customOnlyMeal(dateKey, 'lunch', '食堂随便吃点', 700)
  } else if (offset === 14) {
    // 有当天记录但三餐都没开始：用于验证空状态。
  } else if (offset === 19) {
    // 只有一条没有热量的自定义记录：当日合计为 null。
    meals.dinner = customOnlyMeal(dateKey, 'dinner', '家里煮的面', null)
  } else {
    const count = 1 + Math.floor(rng() * 3)
    const selected = shuffle(MEAL_TYPES, rng).slice(0, count)
    for (const meal of selected) {
      meals[meal] = checkedInMeal(dateKey, meal, rng)
    }
  }

  return {
    dateKey,
    meals,
    tokens: { dateKey, count: 0, customRewardClaimed: false },
  }
}

function collectStamps(days) {
  const stamps = {}

  for (const dateKey of Object.keys(days).sort()) {
    const date = days[dateKey]
    for (const meal of MEAL_TYPES) {
      const record = date.meals[meal]
      if (!record.budget.checkedIn) {
        continue
      }
      const candidate = record.candidateCombos.find(
        (item) => item.id === record.selectedCandidateId,
      )
      if (!candidate) {
        continue
      }

      const seen = new Set()
      for (const component of candidate.components) {
        if (
          component.kind !== 'dish' ||
          component.discarded ||
          !component.eaten ||
          !component.dishId ||
          seen.has(component.dishId)
        ) {
          continue
        }
        seen.add(component.dishId)

        const existing = stamps[component.dishId]
        if (existing) {
          existing.checkInCount += 1
          existing.checkInDates.push(dateKey)
        } else {
          stamps[component.dishId] = {
            checkInCount: 1,
            firstCheckInDate: dateKey,
            checkInDates: [dateKey],
          }
        }
      }
    }
  }

  return stamps
}

export function buildSeedData({
  todayKey = toDateKey(),
  days = DEFAULTS.days,
  seed = DEFAULTS.seed,
} = {}) {
  if (!parseDateKey(todayKey)) {
    throw new Error(`无效日期: ${todayKey}`)
  }
  if (!Number.isInteger(days) || days < 7 || days > 365) {
    throw new Error('--days 必须是 7 到 365 之间的整数')
  }
  if (!Number.isInteger(seed)) {
    throw new Error('--seed 必须是整数')
  }

  const rng = createRng(seed)
  const dayMap = {}
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const dateKey = shiftDateKey(todayKey, -offset)
    const day = buildDay(dateKey, offset, rng)
    if (day) {
      dayMap[dateKey] = day
    }
  }

  return {
    schemaVersion: 5,
    profile: {
      sex: 'female',
      age: 30,
      heightCm: 165,
      weightKg: 60,
      activity: 'sedentary',
      goal: 'maintain',
    },
    targetCalories: 1800,
    pityCount: 3,
    days: dayMap,
    stamps: collectStamps(dayMap),
    settings: {
      showCalories: true,
      profileHintDismissed: true,
      theme: 'cute',
    },
  }
}

function parseArgs(argv) {
  const options = { ...DEFAULTS, today: toDateKey() }

  for (let index = 2; index < argv.length; index += 1) {
    const raw = argv[index]
    if (raw === '--stdout') {
      options.stdout = true
      continue
    }

    if (!raw.startsWith('--')) {
      throw new Error(`无法识别的参数: ${raw}`)
    }

    const equals = raw.indexOf('=')
    const name = equals === -1 ? raw.slice(2) : raw.slice(2, equals)
    const value =
      equals === -1 ? argv[(index += 1)] : raw.slice(equals + 1)
    if (value === undefined) {
      throw new Error(`参数缺少值: --${name}`)
    }

    switch (name) {
      case 'days':
        options.days = Number(value)
        break
      case 'today':
        options.today = value
        break
      case 'seed':
        options.seed = Number(value)
        break
      case 'out':
        options.out = value
        break
      default:
        throw new Error(`未知参数: --${name}`)
    }
  }

  return options
}

function assertSafeOutputPath(outPath) {
  const forbidden = [resolve(ROOT, 'src'), resolve(ROOT, 'public')]
  for (const directory of forbidden) {
    if (outPath === directory || outPath.startsWith(directory + sep)) {
      throw new Error('演示数据不能写进 src/ 或 public/，请换一个输出路径')
    }
  }
}

function main() {
  const options = parseArgs(process.argv)
  const data = buildSeedData({
    todayKey: options.today,
    days: options.days,
    seed: options.seed,
  })

  const json = options.stdout
    ? JSON.stringify(data)
    : `${JSON.stringify(data, null, 2)}\n`

  if (options.stdout) {
    process.stdout.write(json)
    process.stderr.write(
      `已生成 ${Object.keys(data.days).length} 天演示数据（stdout，${SEED_NAMESPACE}）\n${SEED_WARNING}`,
    )
    return
  }

  const outPath = resolve(process.cwd(), options.out)
  assertSafeOutputPath(outPath)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, json, 'utf8')

  const sizeKb = Math.ceil(Buffer.byteLength(json) / 1024)
  process.stderr.write(
    [
      SEED_WARNING.trimEnd(),
      `已生成 ${Object.keys(data.days).length} 天演示数据（${sizeKb} KB，${SEED_NAMESPACE}）`,
      `输出：${outPath}`,
      '',
      '导入方式：',
      '  1. 打开应用 → 设置 → 导入备份',
      '  2. 选择上面的 JSON 文件（会先出现覆盖确认并自动快照）',
      '  3. 进入「日历」Tab，切换月份查看最近 45 天',
      '清空演示数据：设置 → 清空数据（同样会自动快照）',
      '',
    ].join('\n'),
  )
}

const entryHref = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : ''
if (entryHref === import.meta.url) {
  try {
    main()
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    )
    process.exitCode = 1
  }
}
