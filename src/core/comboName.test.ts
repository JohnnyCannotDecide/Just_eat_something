import { describe, expect, it } from 'vitest'

import { countUnicodeChars } from '@/data/dataRules'

import {
  COMBO_NAME_FALLBACK,
  COMBO_NAME_MAX_CHARS,
  generateComboName,
  refreshComboName,
  resolveCandidateName,
  withAutoComboName,
  withManualComboName,
} from './comboName'
import type {
  ComboCandidateSnapshot,
  DishCategory,
  MealComponentSnapshot,
  MealType,
} from './types'

function part(
  name: string,
  category: DishCategory | null,
  overrides: Partial<MealComponentSnapshot> = {},
): MealComponentSnapshot {
  return {
    id: `comp:${name}`,
    kind: category === null ? 'custom' : 'dish',
    origin: 'combo',
    dishId: category === null ? null : `dish_${name}`,
    name,
    category,
    rarity: 'R',
    image: null,
    cooking: null,
    ingredients: [],
    grams: null,
    calories: null,
    eaten: true,
    discarded: false,
    ...overrides,
  }
}

function candidate(
  components: MealComponentSnapshot[],
  overrides: Partial<ComboCandidateSnapshot> = {},
): ComboCandidateSnapshot {
  return {
    id: 'candidate-1',
    comboId: 'combo-1',
    source: 'draw',
    name: '原始名字',
    nameSource: 'auto',
    baseName: '原始名字',
    baseDishIds: ['dish_番茄牛腩', 'dish_米饭'],
    rarity: 'R',
    components,
    ...overrides,
  }
}

describe('generateComboName', () => {
  it('is stable for the same state and seed', () => {
    const parts = [part('番茄炒蛋', 'main'), part('白米饭', 'staple')]
    const first = generateComboName(parts, 'lunch', 'seed-a')
    const second = generateComboName(parts, 'lunch', 'seed-a')
    expect(first).toBe(second)
  })

  it('can vary with the seed while staying deterministic per seed', () => {
    const parts = [part('番茄炒蛋', 'main'), part('白米饭', 'staple')]
    const names = new Set(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((seed) =>
        generateComboName(parts, 'lunch', seed),
      ),
    )
    expect(names.size).toBeGreaterThan(1)
  })

  it('returns the fallback when nothing is active', () => {
    expect(generateComboName([], 'lunch', 'seed')).toBe(COMBO_NAME_FALLBACK)
    expect(
      generateComboName(
        [part('番茄炒蛋', 'main', { discarded: true })],
        'lunch',
        'seed',
      ),
    ).toBe(COMBO_NAME_FALLBACK)
  })

  it('supports one, two, and three-plus parts in every meal', () => {
    const meals: MealType[] = ['breakfast', 'lunch', 'dinner']
    const bundles = [
      [part('白粥', 'staple')],
      [part('番茄炒蛋', 'main'), part('白米饭', 'staple')],
      [
        part('番茄炒蛋', 'main'),
        part('白米饭', 'staple'),
        part('青菜', 'veg'),
        part('紫菜蛋汤', 'soup'),
      ],
    ]

    for (const meal of meals) {
      for (const bundle of bundles) {
        const name = generateComboName(bundle, meal, 'seed')
        expect(name).not.toBe(COMBO_NAME_FALLBACK)
        expect(countUnicodeChars(name)).toBeLessThanOrEqual(
          COMBO_NAME_MAX_CHARS,
        )
      }
    }
  })

  it('puts main before staple before other categories', () => {
    const parts = [
      part('蒜蓉青菜', 'veg'),
      part('白米饭', 'staple'),
      part('番茄牛腩', 'main'),
    ]
    const name = generateComboName(parts, 'lunch', 'hero-seed')
    expect(name.startsWith('番茄牛腩')).toBe(true)
  })

  it('keeps long dish names at or below ten code points', () => {
    const parts = [
      part('木耳胡萝卜芹菜炒蛋', 'main'),
      part('蒜蓉西兰花', 'veg'),
    ]
    const four = [...parts, part('紫菜蛋花汤', 'soup'), part('白米饭', 'staple')]

    for (const bundle of [parts, four]) {
      const name = generateComboName(bundle, 'dinner', 'long-seed')
      expect(countUnicodeChars(name)).toBeLessThanOrEqual(
        COMBO_NAME_MAX_CHARS,
      )
      expect(name.length).toBeGreaterThan(0)
    }
  })

  it('counts emoji as one character when trimming', () => {
    const name = generateComboName(
      [part('🍅🍅🍅🍅🍅🍅🍅🍅', 'main')],
      'breakfast',
      'emoji-seed',
    )
    expect(countUnicodeChars(name)).toBeLessThanOrEqual(COMBO_NAME_MAX_CHARS)
  })

  it('ignores discarded parts', () => {
    const active = generateComboName(
      [part('番茄炒蛋', 'main')],
      'lunch',
      'seed',
    )
    const withDiscarded = generateComboName(
      [
        part('番茄炒蛋', 'main'),
        part('白米饭', 'staple', { discarded: true }),
      ],
      'lunch',
      'seed',
    )
    expect(withDiscarded).toBe(active)
  })
})

describe('resolveCandidateName', () => {
  const baseParts = [part('番茄牛腩', 'main'), part('米饭', 'staple')]

  it('returns the base name while the original combination is active', () => {
    expect(
      resolveCandidateName(candidate(baseParts), 'lunch'),
    ).toBe('原始名字')
  })

  it('generates a new name once a component changes and restores the base name', () => {
    const changed = candidate([
      part('番茄牛腩', 'main'),
      part('面条', 'staple'),
      part('青菜', 'veg'),
    ])
    const generated = resolveCandidateName(changed, 'lunch')
    expect(generated).not.toBe('原始名字')

    const restored = candidate([
      part('米饭', 'staple'),
      part('番茄牛腩', 'main'),
    ])
    expect(resolveCandidateName(restored, 'lunch')).toBe('原始名字')
  })

  it('does not treat custom components as the base combination', () => {
    const withCustom = candidate([
      part('番茄牛腩', 'main'),
      part('米饭', 'staple'),
      part('饭后小甜点', null),
    ])
    expect(resolveCandidateName(withCustom, 'lunch')).not.toBe('原始名字')
  })

  it('lets a manual name win over everything', () => {
    const named = candidate(baseParts, {
      nameSource: 'manual',
      manualName: '我的番茄牛腩',
    })
    expect(resolveCandidateName(named, 'lunch')).toBe('我的番茄牛腩')
  })
})

describe('withManualComboName', () => {
  it('accepts a trimmed name up to ten characters', () => {
    const named = withManualComboName(
      candidate([part('番茄牛腩', 'main')]),
      '  番茄夜宵  ',
    )
    expect(named.name).toBe('番茄夜宵')
    expect(named.nameSource).toBe('manual')
    expect(named.manualName).toBe('番茄夜宵')
  })

  it('accepts exactly ten emoji', () => {
    const ten = '🍅🍅🍅🍅🍅🍅🍅🍅🍅🍅'
    expect(() =>
      withManualComboName(candidate([part('番茄牛腩', 'main')]), ten),
    ).not.toThrow()
  })

  it('rejects empty and over-long names', () => {
    const base = candidate([part('番茄牛腩', 'main')])
    expect(() => withManualComboName(base, '   ')).toThrow('不能为空')
    expect(() => withManualComboName(base, '一二三四五六七八九十一')).toThrow(
      '最多 10 个字',
    )
  })
})

describe('withAutoComboName', () => {
  it('clears the manual name and restores the base name', () => {
    const named = withManualComboName(
      candidate([part('番茄牛腩', 'main'), part('米饭', 'staple')]),
      '我的名字',
    )
    const auto = withAutoComboName(named, 'lunch')
    expect(auto.manualName).toBeUndefined()
    expect(auto.name).toBe('原始名字')
    expect(auto.nameSource).toBe('auto')
  })

  it('restores the frozen original name for legacy and custom records', () => {
    const custom = candidate([part('聚餐', null)], {
      source: 'customRecord',
      name: '聚餐',
      nameSource: 'manual',
      manualName: '聚餐',
      baseName: '聚餐',
      baseDishIds: [],
    })
    const renamed = withManualComboName(custom, '临时名字')
    const auto = withAutoComboName(renamed, 'dinner')

    expect(auto.name).toBe('聚餐')
    expect(auto.nameSource).toBe('legacy')
    expect(auto.manualName).toBeUndefined()
  })
})

describe('refreshComboName', () => {
  it('refreshes draw candidates and keeps legacy records frozen', () => {
    const changed = candidate([
      part('番茄牛腩', 'main'),
      part('面条', 'staple'),
      part('青菜', 'veg'),
    ])
    expect(refreshComboName(changed, 'lunch').name).not.toBe('原始名字')

    const legacy = candidate(changed.components, {
      source: 'legacy',
      name: '旧记录名字',
      nameSource: 'legacy',
    })
    expect(refreshComboName(legacy, 'lunch')).toBe(legacy)
  })

  it('keeps a manual name through a refresh', () => {
    const named = withManualComboName(
      candidate([
        part('番茄牛腩', 'main'),
        part('面条', 'staple'),
        part('青菜', 'veg'),
      ]),
      '手动名字',
    )
    const refreshed = refreshComboName(named, 'lunch')
    expect(refreshed.name).toBe('手动名字')
    expect(refreshed.nameSource).toBe('manual')
  })

  it('restores the original combo name after going back to the base', () => {
    const changed = candidate([
      part('番茄牛腩', 'main'),
      part('面条', 'staple'),
    ])
    const refreshed = refreshComboName(changed, 'lunch')
    expect(refreshed.name).not.toBe('原始名字')

    const restored = {
      ...refreshed,
      components: candidate([
        part('番茄牛腩', 'main'),
        part('米饭', 'staple'),
      ]).components,
    }
    expect(refreshComboName(restored, 'lunch').name).toBe('原始名字')
  })
})
