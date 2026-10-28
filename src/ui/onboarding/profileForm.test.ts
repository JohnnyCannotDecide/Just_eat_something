import { describe, expect, it } from 'vitest'

import { calcTargetCalories } from '@/core/targetCalories'
import type { BodyProfile } from '@/core/types'

import {
  createProfileDraft,
  getTargetPreview,
  toBodyProfile,
  validateProfileDraft,
  validateStep,
} from './profileForm'
import type { ProfileDraft } from './profileForm'

const validDraft: ProfileDraft = {
  sex: 'female',
  age: '30',
  heightCm: '165',
  weightKg: '60',
  activity: 'sedentary',
  goal: 'maintain',
  manualOverride: false,
  manualTargetKcal: '',
}

describe('profile form', () => {
  it('requires every body field before continuing', () => {
    const draft = createProfileDraft()
    const errors = validateProfileDraft(draft)

    expect(errors.sex).toBeDefined()
    expect(errors.age).toBeDefined()
    expect(errors.heightCm).toBeDefined()
    expect(errors.weightKg).toBeDefined()
    expect(errors.activity).toBeDefined()
    expect(errors.goal).toBeDefined()
    expect(toBodyProfile(draft).profile).toBeNull()
  })

  it('builds a valid profile and previews the formula target', () => {
    const { profile, errors } = toBodyProfile(validDraft)
    const preview = getTargetPreview(validDraft)

    expect(errors).toEqual({})
    expect(profile).toEqual({
      sex: 'female',
      age: 30,
      heightCm: 165,
      weightKg: 60,
      activity: 'sedentary',
      goal: 'maintain',
    })
    expect(preview.autoKcal).toBe(calcTargetCalories(profile!))
    expect(preview.effectiveKcal).toBe(1584)
    expect(preview.manualError).toBeNull()
    expect(preview.belowSafetyFloor).toBe(false)
  })

  it('uses a manual target and warns below the safety floor without blocking', () => {
    const manualDraft: ProfileDraft = {
      ...validDraft,
      manualOverride: true,
      manualTargetKcal: '1000',
    }
    const { profile, errors } = toBodyProfile(manualDraft)
    const preview = getTargetPreview(manualDraft)

    expect(errors).toEqual({})
    expect(profile?.manualTargetKcal).toBe(1000)
    expect(preview.autoKcal).toBe(1584)
    expect(preview.effectiveKcal).toBe(1000)
    expect(preview.belowSafetyFloor).toBe(true)
  })

  it('rejects empty, non-integer, and out-of-range values', () => {
    const draft: ProfileDraft = {
      ...validDraft,
      age: '25.5',
      heightCm: '20',
      weightKg: '',
      activity: '',
    }

    expect(validateStep(draft, 0).age).toContain('整数')
    expect(validateStep(draft, 0).heightCm).toBeDefined()
    expect(validateStep(draft, 0).weightKg).toBeDefined()
    expect(validateStep(draft, 1).activity).toBeDefined()

    const manual: ProfileDraft = {
      ...validDraft,
      manualOverride: true,
      manualTargetKcal: '700',
    }
    expect(validateStep(manual, 1).manualTargetKcal).toBeDefined()
    expect(getTargetPreview(manual).effectiveKcal).toBeNull()

    const emptyManual: ProfileDraft = {
      ...validDraft,
      manualOverride: true,
      manualTargetKcal: '',
    }
    expect(validateStep(emptyManual, 1).manualTargetKcal).toBeDefined()
  })

  it('prefills and round-trips an existing profile in edit mode', () => {
    const profile: BodyProfile = {
      sex: 'male',
      age: 28,
      heightCm: 178,
      weightKg: 72,
      activity: 'moderate',
      goal: 'gain',
      manualTargetKcal: 2600,
    }

    const draft = createProfileDraft(profile)

    expect(draft.manualOverride).toBe(true)
    expect(draft.manualTargetKcal).toBe('2600')
    expect(toBodyProfile(draft)).toEqual({ profile, errors: {} })
  })
})
