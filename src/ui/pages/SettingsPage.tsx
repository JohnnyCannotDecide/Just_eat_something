import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'

import { APP_VERSION } from '@/config/appMeta'
import { ACTIVITY_LEVELS, GOAL_META } from '@/config/gameConfig'
import { calcTargetCalories } from '@/core/targetCalories'
import { useAppStore } from '@/store/useAppStore'
import { useUiStore } from '@/store/useUiStore'

import { ConfirmDialog } from '../components/gameplay/ConfirmDialog'
import { formatKcal, isCaloriesVisible } from '../formatKcal'
import {
  buildExportFileName,
  validateImportFile,
} from '../settings/dataTransfer'

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

  const goal = profile ? GOAL_META[profile.goal] : null
  const activity = profile
    ? ACTIVITY_LEVELS.find((item) => item.level === profile.activity)
    : null
  const formulaTarget = profile
    ? Math.round(
        calcTargetCalories({ ...profile, manualTargetKcal: undefined }),
      )
    : null
  const caloriesVisible = isCaloriesVisible(profile, settings.showCalories)
  const busy = exporting || importing || clearing || clearingProfile

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

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
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
    setImporting(true)
    try {
      const result = await importJson(await file.text())
      if (result.status === 'imported') {
        showToast('备份导入成功')
      } else {
        setDataError(result.message)
      }
    } catch (error) {
      setDataError(errorMessage(error))
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
      await clearProfile()
      setProfileConfirmOpen(false)
      showToast('个人档案已清除')
    } catch (error) {
      setProfileConfirmError(errorMessage(error))
    } finally {
      setClearingProfile(false)
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
                      ? formatKcal(targetCalories, caloriesVisible)
                      : '待设置'
                    : '?'}
                </strong>
                {targetCalories !== null && <small> kcal</small>}
              </dd>
            </div>
          </dl>

          {targetCalories !== null && (
            <p className="profile-card__target-source">
              {profile.manualTargetKcal !== undefined
                ? `手动设定；公式估算约 ${formatKcal(
                    formulaTarget,
                    caloriesVisible,
                  )} kcal`
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
        <label className={`switch-row${profile ? '' : ' is-disabled'}`}>
          <input
            type="checkbox"
            checked={caloriesVisible}
            onChange={() => {
              void handleToggleCalories()
            }}
            disabled={!profile || busy}
          />
          <span className="switch-row__track" aria-hidden="true">
            <span />
          </span>
          <span className="switch-row__text">
            <strong>显示热量</strong>
            <small>
              {profile
                ? '关闭后所有展示型热量会变成 ?，记录仍照常保存。'
                : '填写个人档案后可以打开。'}
            </small>
          </span>
        </label>
      </section>

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
            <small>导入会覆盖当前全部记录</small>
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
          onChange={(event) => {
            void handleImportFile(event)
          }}
        />

        <button
          type="button"
          className="settings-row settings-row--action settings-row--danger"
          onClick={openClearDialog}
          disabled={busy}
        >
          <span>
            <strong>清空数据</strong>
            <small>重新开始一本空白手帐</small>
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
            这个操作不能撤销，建议先导出备份。
          </p>
        </ConfirmDialog>
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
            <li>“显示热量”会自动关闭</li>
          </ul>
          <p className="confirm-dialog__text">
            打卡记录、印章和历史都会保留。这个操作不能撤销。
          </p>
        </ConfirmDialog>
      )}
    </section>
  )
}
