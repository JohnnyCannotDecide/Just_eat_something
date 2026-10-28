import { describe, expect, it } from 'vitest'

import { detectClockChange, readClockSnapshot } from './clock'

describe('clock snapshots', () => {
  it('reads the local date key and timezone offset', () => {
    const now = new Date(2026, 9, 27, 12, 30, 0)

    expect(readClockSnapshot(now)).toEqual({
      dateKey: '2026-10-27',
      timezoneOffset: now.getTimezoneOffset(),
    })
  })

  it('falls back to the current time', () => {
    const snapshot = readClockSnapshot()

    expect(snapshot.dateKey).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(typeof snapshot.timezoneOffset).toBe('number')
  })
})

describe('detectClockChange', () => {
  const base = { dateKey: '2026-10-27', timezoneOffset: -480 }

  it('returns none when nothing changed', () => {
    expect(detectClockChange(base, { ...base })).toBe('none')
  })

  it('detects a date change in either direction', () => {
    expect(
      detectClockChange(base, { ...base, dateKey: '2026-10-28' }),
    ).toBe('date')
    expect(
      detectClockChange(base, { ...base, dateKey: '2026-10-26' }),
    ).toBe('date')
  })

  it('detects a timezone offset change', () => {
    expect(
      detectClockChange(base, { ...base, timezoneOffset: -420 }),
    ).toBe('timezone')
  })

  it('detects both changes at once', () => {
    expect(
      detectClockChange(base, {
        dateKey: '2026-10-28',
        timezoneOffset: 0,
      }),
    ).toBe('both')
  })
})
