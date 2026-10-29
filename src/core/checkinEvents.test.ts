import { describe, expect, it } from 'vitest'

import {
  createCheckInEvent,
  deriveStampsFromEvents,
  legacyCheckInEventId,
  normalizeCheckInEvents,
  reconcileEventsWithStamps,
} from './checkinEvents'
import type { CheckInEvent, StampRecordFields } from './checkinEvents'

const DAY_1 = '2026-10-25'
const DAY_2 = '2026-10-26'

function event(
  id: string,
  dishId: string,
  dateKey: string,
  createdAt: number,
  synthetic?: boolean,
): CheckInEvent {
  return { id, dishId, dateKey, createdAt, ...(synthetic ? { synthetic } : {}) }
}

const stamp = (
  checkInCount: number,
  checkInDates: string[],
  firstCheckInDate = checkInDates[0] ?? '',
): StampRecordFields => ({
  checkInCount,
  firstCheckInDate,
  checkInDates,
})

describe('normalizeCheckInEvents', () => {
  it('keeps valid events, drops broken ones, and dedupes by id', () => {
    const events = normalizeCheckInEvents([
      event('a', 'dish', DAY_1, 1),
      event('a', 'dish', DAY_1, 2),
      event('', 'dish', DAY_1, 1),
      { id: 'b', dishId: 'dish', dateKey: DAY_1, createdAt: Number.NaN },
      { id: 'c', dishId: 'dish', dateKey: DAY_1, createdAt: 3 },
      null,
      'nope',
    ])

    expect(events).toEqual([event('a', 'dish', DAY_1, 1), event('c', 'dish', DAY_1, 3)])
  })

  it('treats a missing value as empty and rejects non-arrays', () => {
    expect(normalizeCheckInEvents(undefined)).toEqual([])
    expect(() => normalizeCheckInEvents('nope')).toThrow('数组')
  })
})

describe('deriveStampsFromEvents', () => {
  it('counts every event but only exposes non-synthetic dates in order', () => {
    const stamps = deriveStampsFromEvents([
      event('b', 'dish', DAY_2, 20),
      event('a', 'dish', DAY_1, 10),
      event('missing', 'dish', DAY_1, 0, true),
    ])

    expect(stamps.dish).toEqual({
      checkInCount: 3,
      firstCheckInDate: DAY_1,
      checkInDates: [DAY_1, DAY_2],
    })
  })

  it('orders equal timestamps by id and preserves same-day duplicates', () => {
    const stamps = deriveStampsFromEvents([
      event('z', 'dish', DAY_1, 5),
      event('a', 'dish', DAY_1, 5),
      event('m', 'dish', DAY_2, 5),
    ])

    expect(stamps.dish?.checkInDates).toEqual([DAY_1, DAY_2, DAY_1])
  })

  it('keeps the cached first date and orphan stamps', () => {
    const stamps = deriveStampsFromEvents(
      [event('a', 'dish', DAY_2, 1)],
      {
        dish: stamp(1, [DAY_2], DAY_1),
        orphan: stamp(0, [], ''),
      },
    )

    expect(stamps.dish?.firstCheckInDate).toBe(DAY_1)
    expect(stamps.orphan).toEqual(stamp(0, [], ''))
  })

  it('is idempotent when fed its own output', () => {
    const events = [
      event('a', 'dish', DAY_1, 1),
      event('missing', 'dish', DAY_1, 0, true),
    ]
    const once = deriveStampsFromEvents(events)
    const twice = deriveStampsFromEvents(events, once)

    expect(twice).toEqual(once)
  })
})

describe('reconcileEventsWithStamps', () => {
  it('adds deterministic events for cached counts and dates that events cannot explain', () => {
    const events = [event('a', 'dish', DAY_1, 1)]
    const reconciled = reconcileEventsWithStamps(events, {
      dish: stamp(4, [DAY_1, DAY_2]),
    })

    expect(reconciled).toHaveLength(4)
    expect(reconciled[1]).toMatchObject({
      id: 'reconcile:dish:date:0',
      dishId: 'dish',
      dateKey: DAY_2,
    })
    expect(
      reconciled.slice(2).map((item) => [item.id, item.synthetic]),
    ).toEqual([
      ['reconcile:dish:count:0', true],
      ['reconcile:dish:count:1', true],
    ])

    const stamps = deriveStampsFromEvents(reconciled)
    expect(stamps.dish).toMatchObject({
      checkInCount: 4,
      checkInDates: [DAY_1, DAY_2],
    })
  })

  it('never lowers the cached count and adds nothing on the second pass', () => {
    const cached = {
      dish: stamp(5, [DAY_1, DAY_1, DAY_2], DAY_1),
    }
    const once = reconcileEventsWithStamps([], cached)
    expect(deriveStampsFromEvents(once, cached).dish?.checkInCount).toBe(5)

    const derived = deriveStampsFromEvents(once, cached)
    expect(reconcileEventsWithStamps(once, derived)).toEqual(once)
  })

  it('keeps generated ids unique even if a reconcile id already exists', () => {
    const events = [
      event('reconcile:dish:date:0', 'dish', DAY_1, 1),
      event('reconcile:dish:count:0', 'dish', DAY_1, 0, true),
    ]
    const reconciled = reconcileEventsWithStamps(events, {
      dish: stamp(3, [DAY_1, DAY_2]),
    })
    const ids = reconciled.map((item) => item.id)

    expect(new Set(ids).size).toBe(ids.length)
    expect(deriveStampsFromEvents(reconciled).dish?.checkInCount).toBe(3)
  })
})

describe('createCheckInEvent', () => {
  it('uses the injected id and timestamp', () => {
    expect(createCheckInEvent('dish', DAY_1, 123, 'event-1')).toEqual({
      id: 'event-1',
      dishId: 'dish',
      dateKey: DAY_1,
      createdAt: 123,
    })
  })

  it('generates distinct ids without an injected id', () => {
    const first = createCheckInEvent('dish', DAY_1, 123)
    const second = createCheckInEvent('dish', DAY_1, 123)

    expect(first.id).not.toBe(second.id)
  })
})

describe('legacyCheckInEventId', () => {
  it('distinguishes same-day occurrences with the global index', () => {
    expect(legacyCheckInEventId('dish', DAY_1, 0)).toBe(
      `legacy:dish:${DAY_1}:0`,
    )
    expect(legacyCheckInEventId('dish', DAY_1, 1)).not.toBe(
      legacyCheckInEventId('dish', DAY_1, 0),
    )
  })
})
