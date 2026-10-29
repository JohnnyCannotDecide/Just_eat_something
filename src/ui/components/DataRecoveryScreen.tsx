import { useCallback, useEffect, useState } from 'react'

import type { SnapshotMeta } from '@/storage/SnapshotStore'
import { useAppStore } from '@/store/useAppStore'

import { ConfirmDialog } from './gameplay/ConfirmDialog'
import { RestoreSnapshotDialog } from './backup/RestoreSnapshotDialog'
import { SnapshotList } from './backup/SnapshotList'
import { formatSnapshotTime } from '../settings/snapshotFormat'

const REASON_TITLES: Record<string, string> = {
  corrupt: '记录暂时没读出来',
  'migration-failed': '数据升级中断了',
  future: '这本手帐来自更新的版本',
}

const REASON_HINTS: Record<string, string> = {
  corrupt:
    '原始数据还完整地留在本机，没有被默认值覆盖。可以先重新读取，或从下面的快照恢复。',
  'migration-failed':
    '升级没有写入完成，原数据保持不变。重新读取或从升级前的快照恢复都可以。',
  future:
    '请先升级应用。旧版本不会覆盖新版本的数据，这里只提供重新读取和下载原始数据。',
}

function downloadRaw(raw: string) {
  const blob = new Blob([raw], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `diet-diary-recovery-${Date.now()}.json`
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function DataRecoveryScreen() {
  const recovery = useAppStore((state) => state.recovery)
  const hydrate = useAppStore((state) => state.hydrate)
  const listSnapshots = useAppStore((state) => state.listSnapshots)
  const restoreSnapshot = useAppStore((state) => state.restoreSnapshot)
  const resetAfterRecovery = useAppStore((state) => state.resetAfterRecovery)

  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [pendingRestore, setPendingRestore] = useState<SnapshotMeta | null>(
    null,
  )
  const [restoring, setRestoring] = useState(false)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)

  const isFuture = recovery?.reason === 'future'

  const refreshSnapshots = useCallback(async () => {
    if (isFuture) {
      return
    }
    setListLoading(true)
    setListError(null)
    const result = await listSnapshots()
    if (result.status === 'ok') {
      setSnapshots(result.snapshots)
    } else {
      setListError(result.message)
    }
    setListLoading(false)
  }, [isFuture, listSnapshots])

  useEffect(() => {
    void refreshSnapshots()
  }, [refreshSnapshots])

  if (!recovery) {
    return null
  }

  const title = REASON_TITLES[recovery.reason] ?? '记录暂时没读出来'
  const hint = REASON_HINTS[recovery.reason] ?? ''

  async function handleRestore() {
    if (!pendingRestore) {
      return
    }
    setRestoring(true)
    setRestoreError(null)
    const result = await restoreSnapshot(pendingRestore.id)
    setRestoring(false)
    if (result.status === 'restored') {
      setPendingRestore(null)
      return
    }
    setRestoreError(result.message)
  }

  async function handleReset() {
    setResetting(true)
    setResetError(null)
    const result = await resetAfterRecovery()
    setResetting(false)
    if (result.status === 'reset') {
      setResetConfirmOpen(false)
      return
    }
    setResetError(result.message)
  }

  return (
    <main className="recovery-screen" role="alert">
      <div className="recovery-card">
        <span className="recovery-card__emoji" aria-hidden="true">
          🍱
        </span>
        <p className="page-kicker">便当手帐</p>
        <h1>{title}</h1>
        <p className="recovery-card__hint">{hint}</p>

        <p className="recovery-card__detail" role="status">
          {recovery.message}
          {recovery.sourceVersion !== null
            ? `（数据版本 v${recovery.sourceVersion}）`
            : ''}
        </p>

        {recovery.snapshotId && (
          <p className="recovery-card__note">
            已自动保存一份恢复前快照，可以在下方找到。
          </p>
        )}

        <div className="recovery-card__actions">
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              void hydrate()
            }}
          >
            重新读取
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              if (recovery.raw !== null) {
                downloadRaw(recovery.raw)
              }
            }}
            disabled={recovery.raw === null}
          >
            下载原始数据
          </button>
        </div>

        {!isFuture && (
          <section className="recovery-card__snapshots" aria-label="本地快照">
            <h2>本地快照</h2>
            <SnapshotList
              snapshots={snapshots}
              loading={listLoading}
              error={listError}
              restoringId={pendingRestore?.id ?? null}
              onRestore={(snapshot) => {
                setRestoreError(null)
                setPendingRestore(snapshot)
              }}
            />
            {snapshots.length > 0 && (
              <p className="recovery-card__note">
                最近一份：
                {formatSnapshotTime(snapshots[0]!.createdAt)}
              </p>
            )}
          </section>
        )}

        {!isFuture && (
          <button
            type="button"
            className="soft-button recovery-card__reset"
            onClick={() => {
              setResetError(null)
              setResetConfirmOpen(true)
            }}
          >
            以空数据重新开始
          </button>
        )}
      </div>

      {pendingRestore && (
        <RestoreSnapshotDialog
          snapshot={pendingRestore}
          pending={restoring}
          error={restoreError}
          onCancel={() => {
            if (!restoring) {
              setPendingRestore(null)
              setRestoreError(null)
            }
          }}
          onConfirm={() => {
            void handleRestore()
          }}
        />
      )}

      {resetConfirmOpen && (
        <ConfirmDialog
          title="要以空数据重新开始吗？"
          description="开始前会先保存一份当前原始数据的快照："
          confirmLabel="确认重新开始"
          pendingLabel="正在保存…"
          pending={resetting}
          error={resetError}
          tone="danger"
          onCancel={() => {
            if (!resetting) {
              setResetConfirmOpen(false)
              setResetError(null)
            }
          }}
          onConfirm={() => {
            void handleReset()
          }}
        >
          <p className="confirm-dialog__text">
            主记录会被清空；已经上传的图片和原始数据备份都会保留，之后仍可从快照恢复。
          </p>
        </ConfirmDialog>
      )}
    </main>
  )
}
