import { useEffect, useState } from 'react'

import { formatSyncCode } from '@/core/sync/code'
import { useSyncStore } from '@/store/useSyncStore'
import { useUiStore } from '@/store/useUiStore'
import type { ConnectChoice, DestructiveKind, SyncRunStatus } from '@/sync/types'

import { ConfirmDialog } from '../gameplay/ConfirmDialog'
import { formatSnapshotTime } from '../../settings/snapshotFormat'

const STATUS_TEXT: Record<SyncRunStatus, string> = {
  disabled: '已暂停',
  idle: '已开启',
  syncing: '同步中…',
  offline: '离线，等网络恢复后自动重试',
  error: '上次同步失败',
  'auth-failed': '同步码无效',
  'needs-choice': '等待选择',
  'needs-confirm': '需要确认',
}

const STATUS_TONE: Record<SyncRunStatus, string> = {
  disabled: 'muted',
  idle: 'ok',
  syncing: 'busy',
  offline: 'warn',
  error: 'warn',
  'auth-failed': 'danger',
  'needs-choice': 'warn',
  'needs-confirm': 'danger',
}

const RECONCILE_TEXT: Record<DestructiveKind, string> = {
  clear: '本机记录刚被清空。可以恢复云端数据，或确认用这份空记录覆盖云端。',
  import: '本机数据刚被一份备份替换。可以恢复云端，或用这份导入的数据覆盖云端。',
  restore: '本机数据刚从本地快照恢复。可以恢复云端，或用恢复后的数据覆盖云端。',
  recovery: '同步状态丢失或损坏，需要重新确认以哪一边为准。',
}

const MASKED_CODE = '••••-••••-••••-••••-••••-••••-••••-••••'

type DialogKind =
  | 'rotate'
  | 'pause'
  | 'forget'
  | 'overwrite'
  | 'cloud-restore'
  | null

const DIALOG_COPY: Record<
  Exclude<DialogKind, null>,
  {
    title: string
    description: string
    confirmLabel: string
    tone: 'default' | 'danger'
  }
> = {
  rotate: {
    title: '要轮换同步码吗？',
    description:
      '旧同步码在 10 分钟内仍然可用，之后作废；其他设备需要用新码重新连接。',
    confirmLabel: '轮换同步码',
    tone: 'default',
  },
  pause: {
    title: '关闭云同步？',
    description:
      '只暂停本机自动同步，保留同步码和全部数据；云端数据不受影响，随时可以重新开启。',
    confirmLabel: '关闭同步',
    tone: 'default',
  },
  forget: {
    title: '删除本机同步码？',
    description:
      '删除后这台设备将无法访问云端数据（云端数据本身不会被删除）。如果其他设备还留着同步码，可以重新连接。',
    confirmLabel: '删除同步码',
    tone: 'danger',
  },
  overwrite: {
    title: '用本机覆盖云端？',
    description:
      '会先自动创建本地快照，然后把本机全部记录上传，覆盖同名的云端记录。',
    confirmLabel: '覆盖云端',
    tone: 'danger',
  },
  'cloud-restore': {
    title: '以云端为准？',
    description:
      '本机记录将被云端数据替换；替换前会自动创建本地快照，可在「数据备份」里恢复。',
    confirmLabel: '用云端数据替换',
    tone: 'danger',
  },
}

/**
 * 设置页的“云同步”区块。只做展示与动作编排；同步逻辑和写入顺序
 * 都在引擎与 useAppStore 的串行队列里，这里不直接碰存储。
 */
export function SyncSection() {
  const view = useSyncStore((state) => state.view)
  const loading = useSyncStore((state) => state.loading)
  const busy = useSyncStore((state) => state.busy)
  const error = useSyncStore((state) => state.error)
  const pendingConnect = useSyncStore((state) => state.pendingConnect)
  const refresh = useSyncStore((state) => state.refresh)
  const enable = useSyncStore((state) => state.enable)
  const connect = useSyncStore((state) => state.connect)
  const choose = useSyncStore((state) => state.choose)
  const syncNow = useSyncStore((state) => state.syncNow)
  const rotate = useSyncStore((state) => state.rotate)
  const pause = useSyncStore((state) => state.pause)
  const forget = useSyncStore((state) => state.forget)
  const clearPendingConnect = useSyncStore(
    (state) => state.clearPendingConnect,
  )
  const showToast = useUiStore((state) => state.showToast)

  const [codeInput, setCodeInput] = useState('')
  const [codeVisible, setCodeVisible] = useState(false)
  const [manualCopy, setManualCopy] = useState(false)
  const [dialog, setDialog] = useState<DialogKind>(null)
  const [dialogPending, setDialogPending] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)

  useEffect(() => {
    void refresh()
  }, [refresh])

  const status = view?.status ?? 'disabled'
  const code = view?.code ?? null
  const needsConfirm = status === 'needs-confirm'
  const hasState = view?.enabled === true || Boolean(code)

  async function handleEnable() {
    if (await enable()) {
      showToast('云同步已开启')
    }
  }

  async function handleConnect() {
    const result = await connect(codeInput)
    if (!result) {
      return
    }
    if (
      result.status === 'idle' ||
      result.status === 'needs-choice' ||
      result.status === 'needs-upload'
    ) {
      setCodeInput('')
    }
    if (result.status === 'idle') {
      showToast(result.localHasData ? '已连接到云端' : '已从云端恢复')
    }
  }

  async function handleChoose(kind: ConnectChoice) {
    const result = await choose(kind)
    if (!result) {
      return
    }
    if (result.status !== 'idle') {
      showToast(useSyncStore.getState().error ?? '操作失败', 'error')
      return
    }
    if (kind === 'merge') {
      showToast('已合并两边数据')
    } else if (kind === 'cloud') {
      showToast('已用云端数据替换本机')
    } else {
      showToast('已上传本机数据')
    }
  }

  async function handleSyncNow() {
    const result = await syncNow()
    if (!result) {
      return
    }
    if (result.status === 'idle') {
      showToast('同步完成')
    } else {
      showToast(useSyncStore.getState().error ?? '同步失败', 'error')
    }
  }

  async function handleCopy() {
    if (!code) {
      return
    }
    const text = formatSyncCode(code)
    try {
      await navigator.clipboard.writeText(text)
      setManualCopy(false)
      showToast('同步码已复制')
    } catch {
      setManualCopy(true)
      showToast('无法自动复制，请手动选择文本', 'error')
    }
  }

  function openDialog(kind: Exclude<DialogKind, null>) {
    setDialogError(null)
    setDialog(kind)
  }

  function closeDialog() {
    if (dialogPending) {
      return
    }
    setDialog(null)
    setDialogError(null)
  }

  async function handleDialogConfirm() {
    const kind = dialog
    if (!kind) {
      return
    }
    setDialogError(null)
    setDialogPending(true)
    try {
      if (kind === 'rotate') {
        if (await rotate()) {
          setDialog(null)
          setCodeVisible(false)
          setManualCopy(false)
          showToast('同步码已轮换，请在其他设备输入新码')
        } else {
          setDialogError(
            useSyncStore.getState().error ?? '轮换失败，旧同步码仍然有效',
          )
        }
        return
      }
      if (kind === 'pause') {
        await pause()
        setDialog(null)
        showToast('云同步已暂停，本机同步码仍保留')
        return
      }
      if (kind === 'forget') {
        await forget()
        setDialog(null)
        setCodeVisible(false)
        setManualCopy(false)
        showToast('已删除本机同步码')
        return
      }
      const result = await choose(
        kind === 'overwrite' ? 'upload' : 'cloud',
      )
      if (result?.status === 'idle') {
        setDialog(null)
        showToast(
          kind === 'overwrite'
            ? '已用本机数据更新云端'
            : '已用云端数据替换本机',
        )
      } else {
        setDialogError(
          result?.error ?? useSyncStore.getState().error ?? '操作失败',
        )
      }
    } finally {
      setDialogPending(false)
    }
  }

  const dialogCopy = dialog ? DIALOG_COPY[dialog] : null

  return (
    <section className="settings-section sync-section" aria-labelledby="sync-title">
      <h2 className="settings-section__title" id="sync-title">
        云同步
      </h2>

      {pendingConnect && (
        <div className="sync-card">
          <div className="sync-card__intro">
            <strong>
              {pendingConnect.reason === 'choice'
                ? '这台设备和云端都有数据'
                : '云端还没有数据'}
            </strong>
            <p>
              {pendingConnect.reason === 'choice'
                ? '选一个开始方式。合并会先自动快照；以云端为准会用云端数据替换本机记录。'
                : '要先把本机现在的记录上传到云端吗？'}
            </p>
          </div>
          <div className="sync-actions sync-actions--stack">
            {pendingConnect.reason === 'choice' ? (
              <>
                <button
                  type="button"
                  className="soft-button"
                  onClick={() => {
                    void handleChoose('merge')
                  }}
                  disabled={busy}
                >
                  合并两边数据（推荐）
                </button>
                <button
                  type="button"
                  className="soft-button"
                  onClick={() => openDialog('cloud-restore')}
                  disabled={busy}
                >
                  以云端为准
                </button>
              </>
            ) : (
              <button
                type="button"
                className="soft-button"
                onClick={() => {
                  void handleChoose('upload')
                }}
                disabled={busy}
              >
                上传本机数据
              </button>
            )}
            <button
              type="button"
              className="sync-link"
              onClick={clearPendingConnect}
              disabled={busy}
            >
              稍后决定
            </button>
          </div>
        </div>
      )}

      {!pendingConnect && !hasState && (
        <div className="sync-card">
          <div className="sync-card__intro">
            <strong>多台设备共用一本手帐</strong>
            <p>
              数据只存在你自己的 Cloudflare D1 里。同步码是唯一钥匙，只保存在本机，不会写进备份或日志。
            </p>
          </div>
          <button
            type="button"
            className="soft-button"
            onClick={() => {
              void handleEnable()
            }}
            disabled={busy || loading}
          >
            {busy ? '正在开启…' : '开启云同步'}
          </button>
          <div className="sync-connect">
            <label htmlFor="sync-code-input">已有同步码？</label>
            <div className="sync-connect__row">
              <input
                id="sync-code-input"
                className="sync-input"
                value={codeInput}
                onChange={(event) => setCodeInput(event.target.value)}
                placeholder="XXXX-XXXX-XXXX-XXXX…"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                disabled={busy}
              />
              <button
                type="button"
                className="soft-button sync-connect__button"
                onClick={() => {
                  void handleConnect()
                }}
                disabled={busy || codeInput.trim() === ''}
              >
                连接
              </button>
            </div>
          </div>
          {error && (
            <p className="settings-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}

      {!pendingConnect && hasState && (
        <div className="sync-card">
          <div className="sync-card__head">
            <span
              className={`sync-status sync-status--${STATUS_TONE[status]}`}
              role="status"
            >
              <span className="sync-status__dot" aria-hidden="true" />
              {STATUS_TEXT[status]}
            </span>
            <span className="sync-time">
              {view?.lastSyncedAt
                ? `最近同步 ${formatSnapshotTime(view.lastSyncedAt)}`
                : '还没有同步过'}
            </span>
          </div>

          {(view?.lastError ?? error) && (
            <p className="settings-error" role="alert">
              {view?.lastError ?? error}
            </p>
          )}

          {code && (
            <div className="sync-code">
              <span className="sync-code__label">同步码</span>
              <code className="sync-code__value">
                {codeVisible ? formatSyncCode(code) : MASKED_CODE}
              </code>
              <div className="sync-code__actions">
                <button
                  type="button"
                  className="soft-button"
                  onClick={() => setCodeVisible((value) => !value)}
                >
                  {codeVisible ? '隐藏' : '显示'}
                </button>
                <button
                  type="button"
                  className="soft-button"
                  onClick={() => {
                    void handleCopy()
                  }}
                >
                  复制
                </button>
              </div>
              {manualCopy && (
                <input
                  readOnly
                  className="sync-input"
                  aria-label="同步码（可手动复制）"
                  value={formatSyncCode(code)}
                  onFocus={(event) => event.currentTarget.select()}
                />
              )}
            </div>
          )}

          {needsConfirm && (
            <div className="sync-choice">
              <strong>检测到本机数据被整体替换</strong>
              <p>{RECONCILE_TEXT[view?.needsReconcile ?? 'recovery']}</p>
              <p className="sync-choice__hint">在你选择之前不会自动同步。</p>
              <div className="sync-actions sync-actions--stack">
                <button
                  type="button"
                  className="soft-button"
                  onClick={() => {
                    void handleChoose('cloud')
                  }}
                  disabled={busy}
                >
                  保留云端并恢复
                </button>
                <button
                  type="button"
                  className="soft-button"
                  onClick={() => openDialog('overwrite')}
                  disabled={busy}
                >
                  用本机覆盖云端
                </button>
                <button
                  type="button"
                  className="sync-link sync-link--danger"
                  onClick={() => openDialog('forget')}
                  disabled={busy}
                >
                  断开同步
                </button>
              </div>
            </div>
          )}

          {!needsConfirm && (
            <div className="sync-actions">
              {view?.enabled ? (
                <button
                  type="button"
                  className="soft-button"
                  onClick={() => {
                    void handleSyncNow()
                  }}
                  disabled={busy}
                >
                  {busy ? '同步中…' : '立即同步'}
                </button>
              ) : (
                <button
                  type="button"
                  className="soft-button"
                  onClick={() => {
                    void handleEnable()
                  }}
                  disabled={busy}
                >
                  {busy ? '正在开启…' : '重新开启云同步'}
                </button>
              )}
              {view?.enabled && (
                <>
                  <button
                    type="button"
                    className="soft-button"
                    onClick={() => openDialog('rotate')}
                    disabled={busy}
                  >
                    轮换同步码
                  </button>
                  <button
                    type="button"
                    className="soft-button"
                    onClick={() => openDialog('pause')}
                    disabled={busy}
                  >
                    关闭同步
                  </button>
                </>
              )}
            </div>
          )}

          {code && !needsConfirm && (
            <button
              type="button"
              className="sync-link sync-link--danger"
              onClick={() => openDialog('forget')}
              disabled={busy}
            >
              删除本机同步码
            </button>
          )}

          {needsConfirm && code && (
            <p className="sync-choice__hint">
              断开同步只会删除本机同步码，不会删除云端数据。
            </p>
          )}
        </div>
      )}

      {dialog && dialogCopy && (
        <ConfirmDialog
          title={dialogCopy.title}
          description={dialogCopy.description}
          confirmLabel={dialogCopy.confirmLabel}
          pendingLabel="处理中…"
          pending={dialogPending}
          error={dialogError}
          tone={dialogCopy.tone}
          onCancel={closeDialog}
          onConfirm={() => {
            void handleDialogConfirm()
          }}
        />
      )}
    </section>
  )
}
