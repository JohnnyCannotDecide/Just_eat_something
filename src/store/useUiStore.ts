import { create } from 'zustand'

export type TabKey = 'today' | 'calendar' | 'stamps' | 'settings'
export type ToastTone = 'info' | 'error'

export interface ToastMessage {
  id: number
  text: string
  tone: ToastTone
}

let toastSeq = 0

interface UiState {
  activeTab: TabKey
  isProfileEditorOpen: boolean
  /** 编辑身体信息时从第几步开始：0 身体信息，1 目标与活动。 */
  profileEditorStartStep: 0 | 1
  toast: ToastMessage | null
  setActiveTab: (tab: TabKey) => void
  openProfileEditor: (step?: 0 | 1) => void
  closeProfileEditor: () => void
  showToast: (text: string, tone?: ToastTone) => void
  dismissToast: () => void
}

export const useUiStore = create<UiState>()((set) => ({
  activeTab: 'today',
  isProfileEditorOpen: false,
  profileEditorStartStep: 0,
  toast: null,
  setActiveTab: (activeTab) => set({ activeTab }),
  openProfileEditor: (step = 0) =>
    set({ isProfileEditorOpen: true, profileEditorStartStep: step }),
  closeProfileEditor: () =>
    set({ isProfileEditorOpen: false, profileEditorStartStep: 0 }),
  showToast: (text, tone = 'info') => {
    toastSeq += 1
    set({ toast: { id: toastSeq, text, tone } })
  },
  dismissToast: () => set({ toast: null }),
}))
