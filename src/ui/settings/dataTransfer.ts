import { BACKUP_MAX_BYTES } from '@/config/storageLimits'

/** 与导出共用同一上限，保证导出的备份一定能导回来。 */
export const MAX_IMPORT_BYTES = BACKUP_MAX_BYTES

const MAX_IMPORT_MB = Math.round(MAX_IMPORT_BYTES / (1024 * 1024))

export function buildExportFileName(dateKey: string): string {
  return `diet-diary-${dateKey}.json`
}

/**
 * 读取文件前先做廉价校验，避免把超大的无关文件读进内存。
 * 返回 null 表示通过；否则返回可以直接展示的中文错误。
 */
export function validateImportFile(file: {
  name: string
  size: number
}): string | null {
  if (!/\.json$/i.test(file.name.trim())) {
    return '请选择 .json 格式的备份文件'
  }
  if (file.size > MAX_IMPORT_BYTES) {
    return `文件超过 ${MAX_IMPORT_MB} MB，请选择更小的备份`
  }
  return null
}
