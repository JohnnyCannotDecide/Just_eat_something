import { CALORIE_SAFETY_FLOOR } from '@/config/gameConfig'
import { calcTargetCalories } from '@/core/targetCalories'
import type {
  ActivityLevel,
  BodyProfile,
  CalorieGoal,
  Sex,
} from '@/core/types'

export type ProfileStep = 0 | 1

export interface ProfileDraft {
  sex: Sex | ''
  age: string
  heightCm: string
  weightKg: string
  activity: ActivityLevel | ''
  goal: CalorieGoal | ''
  manualOverride: boolean
  manualTargetKcal: string
}

export interface ProfileErrors {
  sex?: string
  age?: string
  heightCm?: string
  weightKg?: string
  activity?: string
  goal?: string
  manualTargetKcal?: string
}

export interface TargetPreview {
  autoKcal: number | null
  effectiveKcal: number | null
  manualError: string | null
  belowSafetyFloor: boolean
}

export const PROFILE_LIMITS = {
  age: { min: 10, max: 120 },
  heightCm: { min: 80, max: 250 },
  weightKg: { min: 20, max: 400 },
  manualTargetKcal: { min: 800, max: 6000 },
} as const

export function createProfileDraft(
  profile: BodyProfile | null = null,
): ProfileDraft {
  if (!profile) {
    return {
      sex: '',
      age: '',
      heightCm: '',
      weightKg: '',
      activity: '',
      goal: '',
      manualOverride: false,
      manualTargetKcal: '',
    }
  }

  return {
    sex: profile.sex,
    age: String(profile.age),
    heightCm: String(profile.heightCm),
    weightKg: String(profile.weightKg),
    activity: profile.activity,
    goal: profile.goal,
    manualOverride: typeof profile.manualTargetKcal === 'number',
    manualTargetKcal:
      typeof profile.manualTargetKcal === 'number'
        ? String(profile.manualTargetKcal)
        : '',
  }
}

function parseNumber(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

function validateRange(
  value: number | null,
  min: number,
  max: number,
  label: string,
  integer = false,
): string | undefined {
  if (value === null) {
    return `请填写${label}`
  }
  if (integer && !Number.isInteger(value)) {
    return `${label}需要是整数`
  }
  if (value < min || value > max) {
    return `${label}需要在 ${min}–${max} 之间`
  }
  return undefined
}

export function validateStep(
  draft: ProfileDraft,
  step: ProfileStep,
): ProfileErrors {
  const errors: ProfileErrors = {}

  if (step === 0) {
    if (!draft.sex) {
      errors.sex = '选一个性别'
    }
    const age = parseNumber(draft.age)
    const ageError = validateRange(
      age,
      PROFILE_LIMITS.age.min,
      PROFILE_LIMITS.age.max,
      '年龄',
      true,
    )
    if (ageError) {
      errors.age = ageError
    }
    const heightError = validateRange(
      parseNumber(draft.heightCm),
      PROFILE_LIMITS.heightCm.min,
      PROFILE_LIMITS.heightCm.max,
      '身高',
    )
    if (heightError) {
      errors.heightCm = heightError
    }
    const weightError = validateRange(
      parseNumber(draft.weightKg),
      PROFILE_LIMITS.weightKg.min,
      PROFILE_LIMITS.weightKg.max,
      '体重',
    )
    if (weightError) {
      errors.weightKg = weightError
    }
    return errors
  }

  if (!draft.activity) {
    errors.activity = '选一个最接近的活动水平'
  }
  if (!draft.goal) {
    errors.goal = '选一个目标'
  }

  if (draft.manualOverride) {
    const manualError = validateRange(
      parseNumber(draft.manualTargetKcal),
      PROFILE_LIMITS.manualTargetKcal.min,
      PROFILE_LIMITS.manualTargetKcal.max,
      '手动目标',
      true,
    )
    if (manualError) {
      errors.manualTargetKcal = manualError
    }
  }

  return errors
}

export function validateProfileDraft(draft: ProfileDraft): ProfileErrors {
  return {
    ...validateStep(draft, 0),
    ...validateStep(draft, 1),
  }
}

function toBaseProfile(draft: ProfileDraft): BodyProfile | null {
  if (!draft.sex || !draft.activity || !draft.goal) {
    return null
  }

  const age = parseNumber(draft.age)
  const heightCm = parseNumber(draft.heightCm)
  const weightKg = parseNumber(draft.weightKg)
  if (age === null || heightCm === null || weightKg === null) {
    return null
  }
  if (Object.keys(validateStep(draft, 0)).length > 0) {
    return null
  }

  return {
    sex: draft.sex,
    age,
    heightCm,
    weightKg,
    activity: draft.activity,
    goal: draft.goal,
  }
}

export function toBodyProfile(draft: ProfileDraft): {
  profile: BodyProfile | null
  errors: ProfileErrors
} {
  const errors = validateProfileDraft(draft)
  if (Object.keys(errors).length > 0) {
    return { profile: null, errors }
  }

  const base = toBaseProfile(draft)
  if (!base) {
    return { profile: null, errors: { goal: '请选择完整信息' } }
  }

  if (draft.manualOverride) {
    const manual = parseNumber(draft.manualTargetKcal)
    if (manual === null) {
      return {
        profile: null,
        errors: { manualTargetKcal: '请填写手动目标' },
      }
    }
    base.manualTargetKcal = Math.round(manual)
  }

  return { profile: base, errors: {} }
}

export function getTargetPreview(draft: ProfileDraft): TargetPreview {
  const base = toBaseProfile(draft)
  let autoKcal: number | null = null
  if (base) {
    try {
      autoKcal = calcTargetCalories(base)
    } catch {
      autoKcal = null
    }
  }

  const manualError =
    validateStep(draft, 1).manualTargetKcal ?? null
  let effectiveKcal = autoKcal
  let belowSafetyFloor = false

  if (draft.manualOverride) {
    const manual = parseNumber(draft.manualTargetKcal)
    if (manual !== null && manualError === null) {
      effectiveKcal = Math.round(manual)
      if (draft.sex) {
        belowSafetyFloor = effectiveKcal < CALORIE_SAFETY_FLOOR[draft.sex]
      }
    } else {
      effectiveKcal = null
    }
  }

  return {
    autoKcal,
    effectiveKcal,
    manualError,
    belowSafetyFloor,
  }
}
