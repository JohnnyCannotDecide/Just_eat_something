import { describe, expect, it } from 'vitest'

import { getStampImageSources, getStampTilt } from './stampVisual'

describe('getStampImageSources', () => {
  it('prefers stampImage and then the dish image', () => {
    expect(
      getStampImageSources({
        stampImage: '/images/stamps/rice.png',
        image: '/images/dishes/rice.png',
      }),
    ).toEqual(['/images/stamps/rice.png', '/images/dishes/rice.png'])
  })

  it('falls back to the dish image when stampImage is missing', () => {
    expect(
      getStampImageSources({ image: '/images/dishes/rice.png' }),
    ).toEqual(['/images/dishes/rice.png'])
  })

  it('trims blanks and removes duplicates', () => {
    expect(
      getStampImageSources({
        stampImage: '  ',
        image: ' /images/dishes/rice.png ',
      }),
    ).toEqual(['/images/dishes/rice.png'])
    expect(
      getStampImageSources({
        stampImage: '/images/dishes/rice.png',
        image: '/images/dishes/rice.png',
      }),
    ).toEqual(['/images/dishes/rice.png'])
  })

  it('returns an empty list when no image is configured', () => {
    expect(getStampImageSources({})).toEqual([])
    expect(getStampImageSources({ stampImage: '', image: ' ' })).toEqual([])
    expect(getStampImageSources({}, null)).toEqual([])
  })

  it('puts a resolved uploaded image first', () => {
    expect(
      getStampImageSources(
        {
          stampImage: '/images/stamps/rice.png',
          image: '/images/dishes/rice.png',
        },
        'blob:uploaded',
      ),
    ).toEqual([
      'blob:uploaded',
      '/images/stamps/rice.png',
      '/images/dishes/rice.png',
    ])
  })
})

describe('getStampTilt', () => {
  it('is deterministic and stays subtle', () => {
    const first = getStampTilt('white_rice')
    const second = getStampTilt('white_rice')

    expect(first).toBe(second)
    expect(Math.abs(first)).toBeLessThanOrEqual(2.1)
  })

  it('varies across dishes', () => {
    const angles = new Set(
      ['white_rice', 'tomato_egg', 'boiled_egg'].map(getStampTilt),
    )
    expect(angles.size).toBeGreaterThan(1)
  })
})
