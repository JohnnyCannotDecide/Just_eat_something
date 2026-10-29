import type { SnapshotMeta } from '@/storage/SnapshotStore'

import {
  formatSnapshotReason,
  formatSnapshotSize,
  formatSnapshotTime,
} from '../../settings/snapshotFormat'

interface SnapshotListProps {
  snapshots: SnapshotMeta[]
  loading?: boolean
  error?: string | null
  /** 正在恢复的快照 id，用于禁用按钮。 */
  restoringId?: string | null
  onRestore?: (snapshot: SnapshotMeta) => void
}

export function SnapshotList({
  snapshots,
  loading = false,
  error = null,
  restoringId = null,
  onRestore,
}: SnapshotListProps) {
  if (loading) {
    return (
      <p className="snapshot-empty" role="status">
        正在读取本地快照…
      </p>
    )
  }

  if (error) {
    return (
      <p className="settings-error" role="alert">
        {error}
      </p>
    )
  }

  if (snapshots.length === 0) {
    return (
      <p className="snapshot-empty">
        还没有快照；升级、清空、导入、恢复前会自动创建，最多保留 10 份。
      </p>
    )
  }

  return (
    <ul className="snapshot-list">
      {snapshots.map((snapshot) => (
        <li className="snapshot-item" key={snapshot.id}>
          <div className="snapshot-item__info">
            <strong>{formatSnapshotReason(snapshot.reason)}</strong>
            <small>
              {formatSnapshotTime(snapshot.createdAt)} ·{' '}
              {formatSnapshotSize(snapshot.sizeBytes)}
              {snapshot.imageCount > 0
                ? ` · ${snapshot.imageCount} 张图片`
                : ''}
            </small>
          </div>
          {onRestore && (
            <button
              type="button"
              className="soft-button snapshot-item__restore"
              onClick={() => onRestore(snapshot)}
              disabled={restoringId !== null}
            >
              {restoringId === snapshot.id ? '恢复中…' : '恢复'}
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}
