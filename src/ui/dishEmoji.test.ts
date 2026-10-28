import { describe, expect, it } from 'vitest'

import { dishes } from '@/data'

import {
  DISH_EMOJI_FALLBACK,
  getDishEmoji,
  getDishImageUrl,
} from './dishEmoji'

describe('dish emoji placeholders', () => {
  it('covers every dish in the catalog', () => {
    expect(dishes).toHaveLength(60)
    for (const dish of dishes) {
      expect(getDishEmoji(dish.id)).not.toBe(DISH_EMOJI_FALLBACK)
    }
  })

  it('falls back for unknown dishes', () => {
    expect(getDishEmoji('not-a-dish')).toBe(DISH_EMOJI_FALLBACK)
  })
})

describe('dish image urls', () => {
  it('returns trimmed image paths', () => {
    expect(getDishImageUrl('/images/dishes/white_rice.png')).toBe(
      '/images/dishes/white_rice.png',
    )
    expect(getDishImageUrl('  /images/dishes/white_rice.png  ')).toBe(
      '/images/dishes/white_rice.png',
    )
  })

  it('returns null for missing or blank paths', () => {
    expect(getDishImageUrl(undefined)).toBeNull()
    expect(getDishImageUrl('')).toBeNull()
    expect(getDishImageUrl('   ')).toBeNull()
  })
})
