import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'

import {
  ACTIVITY_LEVELS,
  CALORIE_SAFETY_FLOOR,
  GOAL_META,
} from '@/config/gameConfig'
import type { CalorieGoal, Sex } from '@/core/types'
import { useAppStore } from '@/store/useAppStore'
import { useUiStore } from '@/store/useUiStore'

import { ACTIVITY_HINTS, MEDICAL_DISCLAIMER, SEX_LABELS } from '../copy'
import {
  createProfileDraft,
  getTargetPreview,
  toBodyProfile,
  validateStep,
} from '../onboarding/profileForm'
import type {
  ProfileDraft,
  ProfileErrors,
  ProfileStep,
} from '../onboarding/profileForm'

interface ProfilePageProps {
  /** 1 表示直接定位到目标热量这一步；无档案时仍从第 0 步开始。 */
  initialStep?: 0 | 1
}

const SEX_OPTIONS: readonly Sex[] = ['female', 'male']
const SEX_EMOJI: Record<Sex, string> = { female: '🌷', male: '🌿' }
const GOAL_OPTIONS: readonly CalorieGoal[] = ['cut', 'maintain', 'gain']

export function ProfilePage({
  initialStep = 0,
}: ProfilePageProps) {
  const profile = useAppStore((state) => state.data.profile)
  const updateProfile = useAppStore((state) => state.updateProfile)
  const closeProfileEditor = useUiStore(
    (state) => state.closeProfileEditor,
  )

  const [draft, setDraft] = useState<ProfileDraft>(() =>
    createProfileDraft(profile),
  )
  const [step, setStep] = useState<ProfileStep>(() =>
    profile && initialStep === 1 ? 1 : 0,
  )
  const [errors, setErrors] = useState<ProfileErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const targetCardRef = useRef<HTMLDivElement>(null)

  const preview = getTargetPreview(draft)

  useEffect(() => {
    headingRef.current?.focus()
  }, [step])

  useEffect(() => {
    if (profile && initialStep === 1) {
      targetCardRef.current?.scrollIntoView({ block: 'center' })
    }
  }, [initialStep, profile])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeProfileEditor()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [closeProfileEditor])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  function updateDraft(patch: Partial<ProfileDraft>) {
    setDraft((previous) => ({ ...previous, ...patch }))
    setErrors((previous) => {
      let next = previous
      for (const key of Object.keys(patch)) {
        if (key in next) {
          if (next === previous) {
            next = { ...previous }
          }
          delete next[key as keyof ProfileErrors]
        }
      }
      return next
    })
  }

  function focusFirstError() {
    window.setTimeout(() => {
      document
        .querySelector<HTMLElement>('.onboarding [aria-invalid="true"]')
        ?.focus()
    }, 0)
  }

  function handleNext() {
    const stepErrors = validateStep(draft, 0)
    setErrors(stepErrors)
    if (Object.keys(stepErrors).length > 0) {
      focusFirstError()
      return
    }
    setStep(1)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (step === 0) {
      handleNext()
      return
    }

    const result = toBodyProfile(draft)
    if (!result.profile) {
      setErrors(result.errors)
      focusFirstError()
      return
    }

    setSubmitting(true)
    try {
      await updateProfile(result.profile)
      closeProfileEditor()
    } catch {
      setSubmitting(false)
    }
  }

  const stepTitle = step === 0 ? '先记下你的小档案' : '你打算怎么吃？'
  const stepHint =
    step === 0
      ? '只要大概的数字，用来估算每天的目标热量。'
      : '选最接近的就好，之后随时都能改。'

  return (
    <div
      className="onboarding onboarding--overlay"
      role="dialog"
      aria-modal
      aria-labelledby="onboarding-title"
    >
      <div className="onboarding__sheet">
        <header className="onboarding__top">
          <span className="onboarding__brand">
            <span aria-hidden="true">🍱</span>
            便当手帐
          </span>
          <button
            type="button"
            className="onboarding__close"
            onClick={closeProfileEditor}
            aria-label="关闭个人档案"
          >
            ×
          </button>
        </header>

        <div className="onboarding__step">
          <div
            className="step-track"
            role="img"
            aria-label={`第 ${step + 1} 步，共 2 步`}
          >
            <span className="step-track__bar is-done" />
            <span
              className={`step-track__bar${step === 1 ? ' is-done' : ''}`}
            />
          </div>
          <span className="step-copy">第 {step + 1} 步 / 共 2 步</span>
        </div>

        <div className="onboarding__intro">
          <p className="onboarding__kicker">
            {profile ? '重新认识一下' : step === 0 ? '初次见面' : '最后一步'}
          </p>
          <h1 id="onboarding-title" ref={headingRef} tabIndex={-1}>
            {stepTitle}
          </h1>
          <p>{stepHint}</p>
        </div>

        <form
          id="onboarding-form"
          className="onboarding__form"
          onSubmit={handleSubmit}
          noValidate
        >
          {step === 0 ? (
            <div className="onboarding__fields">
              <fieldset className="field-group">
                <legend>性别</legend>
                <div className="sex-row">
                  {SEX_OPTIONS.map((sex) => (
                    <label
                      key={sex}
                      className={`sex-card${
                        draft.sex === sex ? ' is-selected' : ''
                      }`}
                    >
                      <input
                        className="choice-control"
                        id={`profile-sex-${sex}`}
                        type="radio"
                        name="profile-sex"
                        value={sex}
                        checked={draft.sex === sex}
                        onChange={() => updateDraft({ sex })}
                        aria-invalid={Boolean(errors.sex)}
                        aria-describedby={
                          errors.sex ? 'profile-sex-error' : undefined
                        }
                      />
                      <span className="sex-card__emoji" aria-hidden="true">
                        {SEX_EMOJI[sex]}
                      </span>
                      <span>{SEX_LABELS[sex]}</span>
                    </label>
                  ))}
                </div>
                {errors.sex && (
                  <p className="field__error" id="profile-sex-error">
                    {errors.sex}
                  </p>
                )}
              </fieldset>

              <div className="field-grid">
                <label className="field" htmlFor="profile-age">
                  <span className="field__label">年龄</span>
                  <span className="field__control">
                    <input
                      id="profile-age"
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="30"
                      value={draft.age}
                      onChange={(event) =>
                        updateDraft({ age: event.target.value })
                      }
                      aria-invalid={Boolean(errors.age)}
                      aria-describedby={
                        errors.age ? 'profile-age-error' : undefined
                      }
                    />
                    <span className="field__unit">岁</span>
                  </span>
                  {errors.age && (
                    <span className="field__error" id="profile-age-error">
                      {errors.age}
                    </span>
                  )}
                </label>

                <label className="field" htmlFor="profile-height">
                  <span className="field__label">身高</span>
                  <span className="field__control">
                    <input
                      id="profile-height"
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="165"
                      value={draft.heightCm}
                      onChange={(event) =>
                        updateDraft({ heightCm: event.target.value })
                      }
                      aria-invalid={Boolean(errors.heightCm)}
                      aria-describedby={
                        errors.heightCm ? 'profile-height-error' : undefined
                      }
                    />
                    <span className="field__unit">cm</span>
                  </span>
                  {errors.heightCm && (
                    <span
                      className="field__error"
                      id="profile-height-error"
                    >
                      {errors.heightCm}
                    </span>
                  )}
                </label>

                <label
                  className="field field--wide"
                  htmlFor="profile-weight"
                >
                  <span className="field__label">体重</span>
                  <span className="field__control">
                    <input
                      id="profile-weight"
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="60"
                      value={draft.weightKg}
                      onChange={(event) =>
                        updateDraft({ weightKg: event.target.value })
                      }
                      aria-invalid={Boolean(errors.weightKg)}
                      aria-describedby={
                        errors.weightKg ? 'profile-weight-error' : undefined
                      }
                    />
                    <span className="field__unit">kg</span>
                  </span>
                  {errors.weightKg && (
                    <span className="field__error" id="profile-weight-error">
                      {errors.weightKg}
                    </span>
                  )}
                </label>
              </div>
            </div>
          ) : (
            <div className="onboarding__fields">
              <fieldset className="field-group">
                <legend>日常活动</legend>
                <div className="activity-list">
                  {ACTIVITY_LEVELS.map((activity) => (
                    <label
                      key={activity.level}
                      className={`activity-card${
                        draft.activity === activity.level
                          ? ' is-selected'
                          : ''
                      }`}
                    >
                      <input
                        className="choice-control"
                        type="radio"
                        name="profile-activity"
                        value={activity.level}
                        checked={draft.activity === activity.level}
                        onChange={() =>
                          updateDraft({ activity: activity.level })
                        }
                        aria-invalid={Boolean(errors.activity)}
                        aria-describedby={
                          errors.activity
                            ? 'profile-activity-error'
                            : undefined
                        }
                      />
                      <span className="activity-card__dot" aria-hidden="true" />
                      <span className="activity-card__text">
                        <strong>{activity.label}</strong>
                        <small>{ACTIVITY_HINTS[activity.level]}</small>
                      </span>
                    </label>
                  ))}
                </div>
                {errors.activity && (
                  <p className="field__error" id="profile-activity-error">
                    {errors.activity}
                  </p>
                )}
              </fieldset>

              <fieldset className="field-group">
                <legend>我的目标</legend>
                <div className="goal-grid">
                  {GOAL_OPTIONS.map((goal) => {
                    const meta = GOAL_META[goal]
                    return (
                      <label
                        key={goal}
                        className={`goal-card${
                          draft.goal === goal ? ' is-selected' : ''
                        }`}
                      >
                        <input
                          className="choice-control"
                          type="radio"
                          name="profile-goal"
                          value={goal}
                          checked={draft.goal === goal}
                          onChange={() => updateDraft({ goal })}
                          aria-invalid={Boolean(errors.goal)}
                          aria-describedby={
                            errors.goal ? 'profile-goal-error' : undefined
                          }
                        />
                        <span className="goal-card__emoji" aria-hidden="true">
                          {meta.emoji}
                        </span>
                        <strong>{meta.label}</strong>
                        <small>{meta.hint}</small>
                      </label>
                    )
                  })}
                </div>
                {errors.goal && (
                  <p className="field__error" id="profile-goal-error">
                    {errors.goal}
                  </p>
                )}
              </fieldset>

              <aside
                className={`target-receipt${
                  preview.belowSafetyFloor ? ' has-warning' : ''
                }`}
                aria-live="polite"
              >
                <div className="target-receipt__top">
                  <span>今日目标小票</span>
                  <span aria-hidden="true">· · ·</span>
                </div>
                {preview.effectiveKcal !== null ? (
                  <>
                    <p className="target-receipt__value">
                      {preview.effectiveKcal}
                      <small>kcal / 天</small>
                    </p>
                    <p className="target-receipt__source">
                      {draft.manualOverride
                        ? '你手动设定的目标'
                        : '按 Mifflin-St Jeor 估算'}
                    </p>
                    {draft.manualOverride &&
                      preview.autoKcal !== null && (
                        <p className="target-receipt__formula">
                          公式估算约 {preview.autoKcal} kcal
                        </p>
                      )}
                  </>
                ) : (
                  <p className="target-receipt__empty">
                    填完身体信息后，这里会出现你的目标。
                  </p>
                )}
                {preview.manualError && (
                  <p className="target-receipt__warning">
                    {preview.manualError}
                  </p>
                )}
                {preview.belowSafetyFloor && draft.sex && (
                  <p className="target-receipt__warning">
                    这个目标低于常见安全下限（
                    {CALORIE_SAFETY_FLOOR[draft.sex]} kcal），只是提醒，不会拦着你。
                  </p>
                )}
              </aside>

              <div className="manual-card" ref={targetCardRef}>
                <label className="switch-row">
                  <input
                    type="checkbox"
                    checked={draft.manualOverride}
                    onChange={(event) => {
                      if (event.target.checked) {
                        updateDraft({
                          manualOverride: true,
                          manualTargetKcal:
                            draft.manualTargetKcal ||
                            (preview.autoKcal !== null
                              ? String(preview.autoKcal)
                              : ''),
                        })
                      } else {
                        updateDraft({ manualOverride: false })
                      }
                    }}
                  />
                  <span className="switch-row__track" aria-hidden="true">
                    <span />
                  </span>
                  <span className="switch-row__text">
                    <strong>我想自己设目标</strong>
                    <small>默认按公式，打开后可以手动填写</small>
                  </span>
                </label>

                {draft.manualOverride && (
                  <label className="field field--manual" htmlFor="profile-manual">
                    <span className="field__label">每日目标</span>
                    <span className="field__control">
                      <input
                        id="profile-manual"
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder={
                          preview.autoKcal !== null
                            ? String(preview.autoKcal)
                            : '1600'
                        }
                        value={draft.manualTargetKcal}
                        onChange={(event) =>
                          updateDraft({
                            manualTargetKcal: event.target.value,
                          })
                        }
                        aria-invalid={Boolean(errors.manualTargetKcal)}
                        aria-describedby={
                          errors.manualTargetKcal
                            ? 'profile-manual-error'
                            : undefined
                        }
                      />
                      <span className="field__unit">kcal</span>
                    </span>
                    {errors.manualTargetKcal && (
                      <span className="field__error" id="profile-manual-error">
                        {errors.manualTargetKcal}
                      </span>
                    )}
                  </label>
                )}
              </div>
            </div>
          )}

        </form>

        <div className="onboarding__footer">
          <div className="onboarding__actions">
            {step === 1 && (
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setErrors({})
                  setStep(0)
                }}
                disabled={submitting}
              >
                上一步
              </button>
            )}
            <button
              type="submit"
              form="onboarding-form"
              className="primary-button"
              disabled={submitting}
            >
              {step === 0
                ? '下一步'
                : submitting
                  ? '正在保存…'
                  : profile
                    ? '保存修改'
                    : '保存档案'}
            </button>
          </div>
          <p className="disclaimer">{MEDICAL_DISCLAIMER}</p>
        </div>
      </div>
    </div>
  )
}
