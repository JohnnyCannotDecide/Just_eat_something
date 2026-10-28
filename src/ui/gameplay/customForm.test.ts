import { describe, expect, it } from 'vitest'

import { createCustomDraft, parseCustomMealDraft } from './customForm'

describe('customForm', () => {
  it('starts empty', () => {
    expect(createCustomDraft()).toEqual({ name: '', calories: '' })
  })

  it('trims the name and rounds calories', () => {
    expect(
      parseCustomMealDraft({ name: '  朋友聚餐 ', calories: ' 800.6 ' }),
    ).toEqual({
      ok: true,
      value: { name: '朋友聚餐', calories: 801 },
    })
  })

  it('accepts zero calories', () => {
    expect(
      parseCustomMealDraft({ name: '白开水', calories: '0' }),
    ).toEqual({
      ok: true,
      value: { name: '白开水', calories: 0 },
    })
  })

  it('accepts a blank calorie field as null', () => {
    expect(parseCustomMealDraft({ name: '夜宵', calories: '   ' })).toEqual({
      ok: true,
      value: { name: '夜宵', calories: null },
    })
  })

  it('rejects a blank name even when calories are blank', () => {
    expect(parseCustomMealDraft({ name: '   ', calories: '' })).toEqual({
      ok: false,
      errors: { name: '给这餐起个名字吧' },
    })
  })

  it('rejects negative and non-numeric calories', () => {
    for (const calories of ['-1', 'abc', 'Infinity']) {
      const result = parseCustomMealDraft({ name: '夜宵', calories })
      expect(result.ok).toBe(false)
      if (result.ok) continue
      expect(result.errors.calories).toBe('热量要填 0 或更大的数字，或留空')
      expect(result.errors.name).toBeUndefined()
    }
  })
})
