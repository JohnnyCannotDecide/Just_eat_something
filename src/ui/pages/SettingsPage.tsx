import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'

import { APP_VERSION } from '@/config/appMeta'
import {
  ACTIVITY_LEVELS,
  GOAL_META,
  type ThemeName,
} from '@/config/gameConfig'
import { calcTargetCalories } from '@/core/targetCalories'
import type { SnapshotMeta } from '@/storage/SnapshotStore'
import { useAppStore } from '@/store/useAppStore'
import { useUiStore } from '@/store/useUiStore'

import { RestoreSnapshotDialog } from '../components/backup/RestoreSnapshotDialog'
import { SnapshotList } from '../components/backup/SnapshotList'
import { ConfirmDialog } from '../components/gameplay/ConfirmDialog'
import { ThemePicker } from '../components/settings/ThemePicker'
import { formatKcal, formatKcalWithUnit } from '../formatKcal'
import {
  buildExportFileName,
  validateImportFile,
} from '../settings/dataTransfer'
import { applyTheme } from '../theme'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function SettingsPage() {
  const profile = useAppStore((state) => state.data.profile)
  const targetCalories = useAppStore((state) => state.data.targetCalories)
  const settings = useAppStore((state) => state.data.settings)
  const todayKey = useAppStore((state) => state.todayKey)
  const exportBackup = useAppStore((state) => state.exportBackup)
  const importJson = useAppStore((state) => state.importJson)
  const clearData = useAppStore((state) => state.clearData)
  const clearProfile = useAppStore((state) => state.clearProfile)
  const setShowCalories = useAppStore((state) => state.setShowCalories)
  const setTheme = useAppStore((state) => state.setTheme)
  const listSnapshots = useAppStore((state) => state.listSnapshots)
  const restoreSnapshot = useAppStore((state) => state.restoreSnapshot)

  const openProfileEditor = useUiStore((state) => state.openProfileEditor)
  const setActiveTab = useUiStore((state) => state.setActiveTab)
  const showToast = useUiStore((state) => state.showToast)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [clearingProfile, setClearingProfile] = useState(false)
  const [dataError, setDataError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [profileConfirmOpen, setProfileConfirmOpen] = useState(false)
  const [profileConfirmError, setProfileConfirmError] = useState<
    string | null
  >(null)
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null)
  const [importConfirmError, setImportConfirmError] = useState<string | null>(
    null,
  )
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([])
  const [snapshotsLoading, setSnapshotsLoading] = useState(true)
  const [snapshotsError, setSnapshotsError] = useState<string | null>(null)
  const [pendingRestore, setPendingRestore] = useState<SnapshotMeta | null>(
    null,
  )
  const [restoring, setRestoring] = useState(false)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [savingTheme, setSavingTheme] = useState(false)

  const goal = profile ? GOAL_META[profile.goal] : null
  const activity = profile
    ? ACTIVITY_LEVELS.find((item) => item.level === profile.activity)
    : null
  const formulaTarget = profile
    ? Math.round(
        calcTargetCalories({ ...profile, manualTargetKcal: undefined }),
      )
    : null
  const caloriesVisible = settings.showCalories
  const busy =
    exporting || importing || clearing || clearingProfile || restoring

  async function refreshSnapshots() {
    setSnapshotsLoading(true)
    const result = await listSnapshots()
    if (result.status === 'ok') {
      setSnapshots(result.snapshots)
      setSnapshotsError(null)
    } else {
      setSnapshotsError(result.message)
    }
    setSnapshotsLoading(false)
  }

  useEffect(() => {
    void refreshSnapshots()
    // 只在进入设置页时读一次；后续操作会主动刷新。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleExport() {
    setDataError(null)
    setExporting(true)
    try {
      const result = await exportBackup()
      if (result.status !== 'ok') {
        setDataError(result.message)
        return
      }

      const blob = new Blob([result.json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = buildExportFileName(todayKey)
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      showToast('备份已导出')
    } catch (error) {
      setDataError(errorMessage(error))
    } finally {
      setExporting(false)
    }
  }

  function handleChooseFile() {
    setDataError(null)
    fileInputRef.current?.click()
  }

  function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0]
    // 立刻清空，保证同一个文件可以再次选择。
    input.value = ''
    if (!file) {
      return
    }

    const validation = validateImportFile(file)
    if (validation) {
      setDataError(validation)
      return
    }

    setDataError(null)
    setImportConfirmError(null)
    setPendingImportFile(file)
  }

  function closeImportDialog() {
    if (importing) {
      return
    }
    setPendingImportFile(null)
    setImportConfirmError(null)
  }

  async function handleImportConfirm() {
    if (!pendingImportFile) {
      return
    }
    setImportConfirmError(null)
    setImporting(true)
    try {
      const result = await importJson(await pendingImportFile.text())
      if (result.status === 'imported') {
        setPendingImportFile(null)
        showToast('备份导入成功')
        await refreshSnapshots()
      } else {
        setImportConfirmError(result.message)
      }
    } catch (error) {
      setImportConfirmError(errorMessage(error))
    } finally {
      setImporting(false)
    }
  }

  async function handleToggleCalories() {
    try {
      await setShowCalories(!settings.showCalories)
    } catch {
      // 持久化失败时 store 会切到启动错误页，这里不重复提示。
    }
  }

  async function handleThemeChange(next: ThemeName) {
    if (savingTheme || next === settings.theme) {
      return
    }

    const previous = settings.theme
    applyTheme(next)
    setSavingTheme(true)
    try {
      await setTheme(next)
    } catch {
      applyTheme(previous)
    } finally {
      setSavingTheme(false)
    }
  }

  function openClearDialog() {
    setConfirmError(null)
    setConfirmOpen(true)
  }

  function closeClearDialog() {
    if (clearing) {
      return
    }
    setConfirmOpen(false)
    setConfirmError(null)
  }

  async function handleClear() {
    setConfirmError(null)
    setClearing(true)
    try {
      const result = await clearData()
      if (result.status === 'cleared') {
        setConfirmOpen(false)
        setActiveTab('today')
        showToast('记录已清空')
        return
      }
      setConfirmError(result.message)
    } catch (error) {
      setConfirmError(errorMessage(error))
    } finally {
      setClearing(false)
    }
  }

  function openClearProfileDialog() {
    setProfileConfirmError(null)
    setProfileConfirmOpen(true)
  }

  function closeClearProfileDialog() {
    if (clearingProfile) {
      return
    }
    setProfileConfirmOpen(false)
    setProfileConfirmError(null)
  }

  async function handleClearProfile() {
    setProfileConfirmError(null)
    setClearingProfile(true)
    try {
      const result = await clearProfile()
      if (result.status === 'cleared') {
        setProfileConfirmOpen(false)
        showToast('个人档案已清除')
        await refreshSnapshots()
      } else {
        setProfileConfirmError(result.message)
      }
    } catch (error) {
      setProfileConfirmError(errorMessage(error))
    } finally {
      setClearingProfile(false)
    }
  }

  function openRestoreDialog(snapshot: SnapshotMeta) {
    setRestoreError(null)
    setPendingRestore(snapshot)
  }

  function closeRestoreDialog() {
    if (restoring) {
      return
    }
    setPendingRestore(null)
    setRestoreError(null)
  }

  async function handleRestore() {
    if (!pendingRestore) {
      return
    }
    setRestoreError(null)
    setRestoring(true)
    try {
      const result = await restoreSnapshot(pendingRestore.id)
      if (result.status === 'restored') {
        setPendingRestore(null)
        showToast('已恢复到选定快照')
        await refreshSnapshots()
      } else {
        setRestoreError(result.message)
      }
    } catch (error) {
      setRestoreError(errorMessage(error))
    } finally {
      setRestoring(false)
    }
  }

  return (
    <section className="page settings-page" aria-labelledby="settings-title">
      <header className="page-head">
        <p className="page-kicker">把自己照顾得明明白白</p>
        <h1 id="settings-title">设置</h1>
        <p className="page-subtitle">
          档案可选填，记录和抽卡随时都能开始。
        </p>
      </header>

      {profile && goal ? (
        <section className="profile-card" aria-label="我的身体档案">
          <div className="profile-card__top">
            <div className="profile-card__avatar" aria-hidden="true">
              {profile.sex === 'female' ? '🌷' : '🌿'}
            </div>
            <div className="profile-card__identity">
              <h2>我的小档案</h2>
              <p>
                {profile.age} 岁 · {profile.heightCm} cm · {profile.weightKg} kg
              </p>
            </div>
            <span className="goal-pill">
              <span aria-hidden="true">{goal.emoji}</span>
              {goal.label}
            </span>
          </div>

          <dl className="profile-stats">
            <div>
              <dt>活动水平</dt>
              <dd>{activity?.label ?? '未设置'}</dd>
            </div>
            <div>
              <dt>每日目标</dt>
              <dd>
                <strong>
                  {caloriesVisible
                    ? targetCalories !== null
                      ? formatKcal(targetCalories, true)
                      : '待设置'
                    : '?'}
                </strong>
                {caloriesVisible && targetCalories !== null && (
                  <small> kcal</small>
                )}
              </dd>
            </div>
          </dl>

          {targetCalories !== null && (
            <p className="profile-card__target-source">
              {profile.manualTargetKcal !== undefined
                ? `手动设定；公式估算约 ${formatKcalWithUnit(
                    formulaTarget,
                    caloriesVisible,
                  )}`
                : '按 Mifflin-St Jeor 公式估算'}
            </p>
          )}

          <p className="profile-card__hint">{goal.hint}，不着急。</p>

          <div className="profile-actions">
            <button
              type="button"
              className="soft-button"
              onClick={() => openProfileEditor(0)}
            >
              修改身体信息
            </button>
            <button
              type="button"
              className="soft-button"
              onClick={() => openProfileEditor(1)}
            >
              调整目标热量
            </button>
            <button
              type="button"
              className="soft-button profile-clear-button"
              onClick={openClearProfileDialog}
              disabled={busy}
            >
              清除个人档案
            </button>
          </div>
        </section>
      ) : (
        <section
          className="profile-card profile-card--guest"
          aria-label="个人档案"
        >
          <div className="profile-card__top">
            <div className="profile-card__avatar" aria-hidden="true">
              🌱
            </div>
            <div className="profile-card__identity">
              <h2>还没有个人档案</h2>
              <p>填了才能估算每日目标；不填也能继续抽卡和记录。</p>
            </div>
          </div>
          <div className="profile-actions">
            <button
              type="button"
              className="soft-button"
              onClick={() => openProfileEditor(0)}
            >
              填写个人档案
            </button>
          </div>
        </section>
      )}

      <section className="settings-prefs" aria-label="显示偏好">
        <label className="switch-row">
          <input
            type="checkbox"
            checked={caloriesVisible}
            onChange={() => {
              void handleToggleCalories()
            }}
            disabled={busy}
          />
          <span className="switch-row__track" aria-hidden="true">
            <span />
          </span>
          <span className="switch-row__text">
            <strong>显示热量</strong>
            <small>关闭后所有展示型热量会变成 ?，记录仍照常保存。</small>
          </span>
        </label>
      </section>

      <section className="settings-section" aria-labelledby="appearance-title">
        <h2 className="settings-section__title" id="appearance-title">
          外观
        </h2>
        <ThemePicker
          value={settings.theme}
          disabled={busy || savingTheme}
          onChange={(next) => {
            void handleThemeChange(next)
          }}
        />
      </section>

      <section className="settings-section" aria-labelledby="backup-title">
        <h2 className="settings-section__title" id="backup-title">
          数据备份
        </h2>
        <div className="settings-list">
          <button
            type="button"
            className="settings-row settings-row--action"
            onClick={() => {
              void handleExport()
            }}
            disabled={busy}
          >
            <span>
              <strong>导出备份</strong>
              <small>保存成一份 JSON 文件，含自制菜图片</small>
            </span>
            <span className="settings-row__mark" aria-hidden="true">
              {exporting ? '…' : '↓'}
            </span>
          </button>

          <button
            type="button"
            className="settings-row settings-row--action"
            onClick={handleChooseFile}
            disabled={busy}
          >
            <span>
              <strong>导入备份</strong>
              <small>会覆盖当前全部记录；导入前自动创建快照</small>
            </span>
            <span className="settings-row__mark" aria-hidden="true">
              {importing ? '…' : '↑'}
            </span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={handleImportFile}
          />
        </div>

        <div className="snapshot-panel" aria-label="本地快照">
          <div className="snapshot-panel__head">
            <span>
              <strong>本地快照</strong>
              <small>升级、清空、导入、恢复前自动创建，最多保留 10 份</small>
            </span>
            <button
              type="button"
              className="snapshot-refresh"
              onClick={() => {
                void refreshSnapshots()
              }}
              disabled={snapshotsLoading || busy}
            >
              {snapshotsLoading ? '读取中…' : '刷新'}
            </button>
          </div>
          <SnapshotList
            snapshots={snapshots}
            loading={snapshotsLoading}
            error={snapshotsError}
            restoringId={restoring ? (pendingRestore?.id ?? '') : null}
            onRestore={openRestoreDialog}
          />
        </div>
      </section>

      <div className="settings-list">
        <button
          type="button"
          className="settings-row settings-row--action settings-row--danger"
          onClick={openClearDialog}
          disabled={busy}
        >
          <span>
            <strong>清空数据</strong>
            <small>重新开始一本空白手帐；清空前自动创建快照</small>
          </span>
          <span className="settings-row__mark" aria-hidden="true">
            ×
          </span>
        </button>

        <div className="settings-row">
          <span>
            <strong>关于便当手帐</strong>
            <small>每日三餐，抽一张再好好吃</small>
          </span>
          <span className="settings-version">v{APP_VERSION}</span>
        </div>
      </div>

      {dataError && (
        <p className="settings-error" role="alert">
          {dataError}
        </p>
      )}

      {confirmOpen && (
        <ConfirmDialog
          title="要清空整本手帐吗？"
          description="清空后，下面的内容都会一起消失："
          confirmLabel="确认清空"
          pendingLabel="正在清空…"
          pending={clearing}
          error={confirmError}
          tone="danger"
          onCancel={closeClearDialog}
          onConfirm={() => {
            void handleClear()
          }}
        >
          <ul className="confirm-dialog__list">
            <li>身体档案和每日目标</li>
            <li>每天的抽卡和打卡记录</li>
            <li>已经收集的全部印章</li>
            <li>自制菜谱和上传的图片</li>
            <li>抽卡券和保底进度</li>
            <li>显示热量和提示关闭状态</li>
          </ul>
          <p className="confirm-dialog__text">
            清空前会自动创建一份快照，可以在「数据备份」里恢复；仍建议先导出备份。
          </p>
        </ConfirmDialog>
      )}

      {pendingImportFile && (
        <ConfirmDialog
          title="要导入这份备份吗？"
          description="导入会覆盖当前全部记录："
          confirmLabel="确认导入"
          pendingLabel="正在导入…"
          pending={importing}
          error={importConfirmError}
          tone="danger"
          onCancel={closeImportDialog}
          onConfirm={() => {
            void handleImportConfirm()
          }}
        >
          <dl className="snapshot-detail">
            <div>
              <dt>文件</dt>
              <dd>{pendingImportFile.name}</dd>
            </div>
            <div>
              <dt>大小</dt>
              <dd>
                {Math.max(1, Math.round(pendingImportFile.size / 1024))} KB
              </dd>
            </div>
          </dl>
          <p className="confirm-dialog__text">
            导入前会自动创建一份当前状态的快照，万一选错了还能恢复。
          </p>
        </ConfirmDialog>
      )}

      {pendingRestore && (
        <RestoreSnapshotDialog
          snapshot={pendingRestore}
          pending={restoring}
          error={restoreError}
          onCancel={closeRestoreDialog}
          onConfirm={() => {
            void handleRestore()
          }}
        />
      )}

      {profileConfirmOpen && (
        <ConfirmDialog
          title="要清除个人档案吗？"
          description="只会清除下面的内容："
          confirmLabel="确认清除"
          pendingLabel="正在清除…"
          pending={clearingProfile}
          error={profileConfirmError}
          tone="danger"
          onCancel={closeClearProfileDialog}
          onConfirm={() => {
            void handleClearProfile()
          }}
        >
          <ul className="confirm-dialog__list">
            <li>身体信息和每日目标</li>
          </ul>
          <p className="confirm-dialog__text">
            “显示热量”开关会保持当前状态。打卡记录、印章和历史都会保留。执行前会自动创建一份快照，可以在「数据备份」里恢复。
          </p>
        </ConfirmDialog>
      )}
    </section>
  )
}
