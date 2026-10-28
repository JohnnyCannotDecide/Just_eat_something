import { describe, expect, it } from 'vitest'

import {
  MAX_IMPORT_BYTES,
  buildExportFileName,
  validateImportFile,
} from './dataTransfer'

describe('data transfer helpers', () => {
  it('builds a dated export file name', () => {
    expect(buildExportFileName('2026-10-27')).toBe(
      'diet-diary-2026-10-27.json',
    )
  })

  it('accepts a normal JSON backup', () => {
    expect(
      validateImportFile({ name: 'diet-diary-2026-10-27.json', size: 1024 }),
    ).toBeNull()
    expect(validateImportFile({ name: 'BACKUP.JSON', size: 0 })).toBeNull()
  })

  it('rejects files without a .json suffix', () => {
    expect(validateImportFile({ name: 'backup.txt', size: 12 })).toBe(
      '请选择 .json 格式的备份文件',
    )
    expect(validateImportFile({ name: 'backup', size: 12 })).toBe(
      '请选择 .json 格式的备份文件',
    )
  })

  it('rejects files above the size limit', () => {
    expect(
      validateImportFile({
        name: 'backup.json',
        size: MAX_IMPORT_BYTES + 1,
      }),
    ).toBe('文件超过 25 MB，请选择更小的备份')

    expect(
      validateImportFile({ name: 'backup.json', size: MAX_IMPORT_BYTES }),
    ).toBeNull()
  })
})
