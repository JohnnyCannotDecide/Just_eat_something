import { describe, expect, it } from 'vitest'

import type {
  ComboCandidateSnapshot,
  CustomDish,
} from '@/core/types'

import { createEmptyAppData } from './appData'
import type { AppData } from './appData'
import {
  BACKUP_FORMAT,
  buildBackup,
  collectReferencedImageIds,
  parseBackupJson,
  serializeBackup,
} from './backup'
import type { StoredImage } from './BinaryStorageAdapter'

const DAY = '2026-10-29'

function customDish(overrides: Partial<CustomDish> = {}): CustomDish {
  return {
    id: 'custom_dish:a',
    name: '番茄炒蛋',
    imageId: 'img:a',
    emoji: '🍅',
    category: 'main',
    meals: ['lunch'],
    rarity: 'R',
    ingredientRows: [{ name: '番茄', kcalPer100g: 20, grams: 200 }],
    calorieMode: 'ingredients',
    calories: null,
    cooking: null,
    includeInPool: true,
    archived: false,
    createdAt: DAY,
    ...overrides,
  }
}

function candidate(imageId: string): ComboCandidateSnapshot {
  return {
    id: 'candidate-1',
    comboId: null,
    source: 'draw',
    name: '套餐',
    nameSource: 'legacy',
    baseName: '套餐',
    baseDishIds: ['custom_dish:a'],
    rarity: 'R',
    components: [
      {
        id: 'comp:1',
        kind: 'dish',
        origin: 'combo',
        dishId: 'custom_dish:a',
        name: '番茄炒蛋',
        category: 'main',
        rarity: 'R',
        image: '🍅',
        imageId,
        cooking: null,
        ingredients: [],
        grams: null,
        calories: 120,
        eaten: true,
        discarded: false,
        seenDishIds: ['custom_dish:a'],
      },
    ],
  }
}

function dataWithReferences(): AppData {
  const base = createEmptyAppData(DAY)
  const day = base.days[DAY]!
  return {
    ...base,
    customDishes: [customDish()],
    days: {
      ...base.days,
      [DAY]: {
        ...day,
        meals: {
          ...day.meals,
          lunch: {
            ...day.meals.lunch,
            candidateCombos: [candidate('img:history')],
          },
        },
      },
    },
  }
}

const image = (bytes: number[] = [1, 2, 3]): StoredImage => ({
  mime: 'image/webp',
  bytes: new Uint8Array(bytes),
})

function imageMap(entries: Record<string, StoredImage>) {
  return new Map(Object.entries(entries))
}

function imageEntry(imageId: string, base64 = 'AQID') {
  return { imageId, mime: 'image/webp', base64 }
}

describe('collectReferencedImageIds', () => {
  it('collects custom dish covers and history snapshots without duplicates', () => {
    const data = dataWithReferences()
    const ids = collectReferencedImageIds(data)

    expect(ids).toEqual(['img:a', 'img:history'])
  })

  it('skips dishes without an image', () => {
    const base = createEmptyAppData(DAY)
    const data: AppData = {
      ...base,
      customDishes: [customDish({ imageId: null })],
    }

    expect(collectReferencedImageIds(data)).toEqual([])
  })
})

describe('buildBackup and parseBackupJson', () => {
  it('round-trips data and images', () => {
    const data = dataWithReferences()
    const bundle = buildBackup(
      data,
      imageMap({
        'img:a': image([1, 2, 3]),
        'img:history': image([4, 5]),
      }),
      DAY,
    )

    expect(bundle.format).toBe(BACKUP_FORMAT)
    expect(bundle.version).toBe(1)

    const parsed = parseBackupJson(serializeBackup(bundle), DAY)

    expect(parsed.data).toEqual(data)
    expect(parsed.images.map((item) => item.imageId)).toEqual([
      'img:a',
      'img:history',
    ])
    expect(parsed.images[0]?.mime).toBe('image/webp')
    expect(Array.from(parsed.images[0]?.bytes ?? [])).toEqual([1, 2, 3])
    expect(Array.from(parsed.images[1]?.bytes ?? [])).toEqual([4, 5])
  })

  it('ignores images that nothing references', () => {
    const bundle = buildBackup(
      dataWithReferences(),
      imageMap({
        'img:a': image(),
        'img:history': image(),
        'img:orphan': image(),
      }),
      DAY,
    )

    expect(bundle.images.map((item) => item.imageId)).toEqual([
      'img:a',
      'img:history',
    ])
  })

  it('refuses to export when a referenced image is missing', () => {
    expect(() =>
      buildBackup(dataWithReferences(), imageMap({ 'img:a': image() }), DAY),
    ).toThrow('图片已经丢失')
  })

  it('still imports a legacy plain AppData backup', () => {
    const data = createEmptyAppData(DAY)
    const parsed = parseBackupJson(JSON.stringify(data), DAY)

    expect(parsed.data).toEqual(data)
    expect(parsed.images).toEqual([])
  })

  it('rejects unknown formats and versions', () => {
    expect(() => parseBackupJson(JSON.stringify({ hi: 1 }), DAY)).toThrow(
      '无法识别的备份格式',
    )

    expect(() =>
      parseBackupJson(
        JSON.stringify({
          format: BACKUP_FORMAT,
          version: 2,
          data: createEmptyAppData(DAY),
          images: [],
        }),
        DAY,
      ),
    ).toThrow('高于当前支持的版本')

    expect(() =>
      parseBackupJson(
        JSON.stringify({
          format: BACKUP_FORMAT,
          version: 0,
          data: createEmptyAppData(DAY),
          images: [],
        }),
        DAY,
      ),
    ).toThrow('不支持的备份版本')
  })

  it('rejects malformed image entries', () => {
    const base = {
      format: BACKUP_FORMAT,
      version: 1,
      data: createEmptyAppData(DAY),
    }

    expect(() =>
      parseBackupJson(
        JSON.stringify({ ...base, images: [imageEntry('img:a', 'data:image/png;base64,AQID')] }),
        DAY,
      ),
    ).toThrow('base64 格式不正确')

    expect(() =>
      parseBackupJson(
        JSON.stringify({
          ...base,
          images: [{ imageId: 'img:a', mime: 'image/gif', base64: 'AQID' }],
        }),
        DAY,
      ),
    ).toThrow('图片格式不受支持')

    expect(() =>
      parseBackupJson(
        JSON.stringify({ ...base, images: [imageEntry('img:a'), imageEntry('img:a')] }),
        DAY,
      ),
    ).toThrow('缺少或重复的图片 id')
  })

  it('rejects images larger than 1 MB', () => {
    // 'A' 重复 140 万次解码后约 1.05 MB，刚好越过单图上限。
    const base64 = 'A'.repeat(4 * 350_000)

    expect(() =>
      parseBackupJson(
        JSON.stringify({
          format: BACKUP_FORMAT,
          version: 1,
          data: createEmptyAppData(DAY),
          images: [imageEntry('img:a', base64)],
        }),
        DAY,
      ),
    ).toThrow('单张图片超过 1 MB')
  })

  it('rejects too many images', () => {
    const images = Array.from({ length: 201 }, (_, index) =>
      imageEntry(`img:${index}`),
    )

    expect(() =>
      parseBackupJson(
        JSON.stringify({
          format: BACKUP_FORMAT,
          version: 1,
          data: createEmptyAppData(DAY),
          images,
        }),
        DAY,
      ),
    ).toThrow('图片太多')
  })

  it('rejects non-JSON text', () => {
    expect(() => parseBackupJson('{bad', DAY)).toThrow('不是合法的 JSON')
  })
})
