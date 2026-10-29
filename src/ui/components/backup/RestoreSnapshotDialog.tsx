import type { SnapshotMeta } from '@/storage/SnapshotStore'

import { ConfirmDialog } from '../gameplay/ConfirmDialog'
import {
  formatSnapshotReason,
  formatSnapshotSize,
  formatSnapshotTime,
} from '../../settings/snapshotFormat'

interface RestoreSnapshotDialogProps {
  snapshot: SnapshotMeta
  pending: boolean
  error: string | null
  onCancel: () => void
  onConfirm: () => void
}

export function RestoreSnapshotDialog({
  snapshot,
  pending,
  error,
  onCancel,
  onConfirm,
}: RestoreSnapshotDialogProps) {
  return (
    <ConfirmDialog
      title="要恢复到这份快照吗？"
      description="当前全部记录会被这份快照替换："
      confirmLabel="确认恢复"
      pendingLabel="正在恢复…"
      pending={pending}
      error={error}
      tone="danger"
      onCancel={onCancel}
      onConfirm={onConfirm}
    >
      <dl className="snapshot-detail">
        <div>
          <dt>快照</dt>
          <dd>{formatSnapshotReason(snapshot.reason)}</dd>
        </div>
        <div>
          <dt>时间</dt>
          <dd>{formatSnapshotTime(snapshot.createdAt)}</dd>
        </div>
        <div>
          <dt>大小</dt>
          <dd>
            {formatSnapshotSize(snapshot.sizeBytes)}
            {snapshot.imageCount > 0
              ? `（含 ${snapshot.imageCount} 张图片）`
              : ''}
          </dd>
        </div>
      </dl>
      <p className="confirm-dialog__text">
        恢复前会再自动创建一份当前状态的快照，万一选错了还能找回来。
      </p>
    </ConfirmDialog>
  )
}
