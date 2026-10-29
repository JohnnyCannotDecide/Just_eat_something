import type { SnapshotReason } from '@/storage/SnapshotStore'

export const SNAPSHOT_REASON_LABELS: Record<SnapshotReason, string> = {
  migration: '升级前',
  'before-clear': '清空前',
  'before-import': '导入前',
  'before-restore': '恢复前',
  'before-clear-profile': '清除档案前',
  'before-recovery': '恢复模式重置前',
}

export function formatSnapshotReason(reason: SnapshotReason): string {
  return SNAPSHOT_REASON_LABELS[reason] ?? reason
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** 本地时间，精确到分钟：2026-10-27 12:05。 */
export function formatSnapshotTime(createdAt: number): string {
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) {
    return '时间未知'
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function formatSnapshotSize(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) {
    return '大小未知'
  }
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`
  }
  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`
  }
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
}
