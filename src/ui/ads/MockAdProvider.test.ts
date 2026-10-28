import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AD } from '@/config/gameConfig'

import { MockAdProvider } from './MockAdProvider'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('MockAdProvider', () => {
  it('starts closed with a stable snapshot', () => {
    const ad = new MockAdProvider()

    expect(ad.getSnapshot()).toEqual({
      open: false,
      secondsLeft: AD.mockCountdownSeconds,
      totalSeconds: AD.mockCountdownSeconds,
    })
    expect(ad.getSnapshot()).toBe(ad.getSnapshot())
    ad.dispose()
  })

  it('counts down five seconds and resolves true', async () => {
    const ad = new MockAdProvider()
    const promise = ad.showRewardedAd()

    expect(ad.getSnapshot()).toMatchObject({ open: true, secondsLeft: 5 })

    vi.advanceTimersByTime(1000)
    expect(ad.getSnapshot().secondsLeft).toBe(4)

    vi.advanceTimersByTime(3000)
    expect(ad.getSnapshot()).toMatchObject({ open: true, secondsLeft: 1 })

    vi.advanceTimersByTime(1000)
    await expect(promise).resolves.toBe(true)
    expect(ad.getSnapshot()).toMatchObject({ open: false })
    ad.dispose()
  })

  it('resolves false when closed early and never turns true later', async () => {
    const ad = new MockAdProvider()
    const promise = ad.showRewardedAd()

    vi.advanceTimersByTime(2000)
    ad.closeEarly()

    await expect(promise).resolves.toBe(false)
    expect(ad.getSnapshot()).toMatchObject({
      open: false,
      secondsLeft: AD.mockCountdownSeconds,
    })

    vi.advanceTimersByTime(10_000)
    await expect(promise).resolves.toBe(false)
    ad.dispose()
  })

  it('returns the same pending promise for repeated calls', async () => {
    const ad = new MockAdProvider()

    const first = ad.showRewardedAd()
    const second = ad.showRewardedAd()

    expect(second).toBe(first)
    vi.advanceTimersByTime(5000)
    await expect(first).resolves.toBe(true)
    ad.dispose()
  })

  it('notifies subscribers for every countdown step', async () => {
    const ad = new MockAdProvider()
    const listener = vi.fn()
    const unsubscribe = ad.subscribe(listener)

    const promise = ad.showRewardedAd()
    vi.advanceTimersByTime(2000)
    expect(listener).toHaveBeenCalledTimes(3)

    unsubscribe()
    vi.advanceTimersByTime(3000)
    expect(listener).toHaveBeenCalledTimes(3)
    await expect(promise).resolves.toBe(true)
    ad.dispose()
  })

  it('cancels an open ad and clears listeners on dispose', async () => {
    const ad = new MockAdProvider()
    const listener = vi.fn()
    ad.subscribe(listener)
    const promise = ad.showRewardedAd()

    ad.dispose()

    await expect(promise).resolves.toBe(false)
    expect(ad.getSnapshot()).toMatchObject({ open: false })
    expect(listener).toHaveBeenCalled()

    listener.mockClear()
    vi.advanceTimersByTime(5000)
    expect(listener).not.toHaveBeenCalled()
  })

  it('clamps an invalid countdown to at least one second', async () => {
    const ad = new MockAdProvider(Number.NaN)
    const promise = ad.showRewardedAd()

    expect(ad.getSnapshot().totalSeconds).toBe(1)
    vi.advanceTimersByTime(1000)
    await expect(promise).resolves.toBe(true)
    ad.dispose()
  })
})
