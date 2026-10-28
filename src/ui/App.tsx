import { useEffect } from 'react'

import { useAppStore } from '@/store/useAppStore'
import { useUiStore } from '@/store/useUiStore'

import { detectClockChange, readClockSnapshot } from './clock'
import type { ClockChange } from './clock'
import { AdModalHost } from './components/gameplay/AdModalHost'
import { ToastHost } from './components/gameplay/ToastHost'
import { BootScreen } from './components/BootScreen'
import { TabBar } from './components/TabBar'
import { CalendarPage } from './pages/CalendarPage'
import { ProfilePage } from './pages/ProfilePage'
import { SettingsPage } from './pages/SettingsPage'
import { StampBookPage } from './pages/StampBookPage'
import { TodayPage } from './pages/TodayPage'

const CLOCK_CHANGE_MESSAGES: Record<Exclude<ClockChange, 'none'>, string> = {
  date: '日期变啦，已按新的本地日期切换',
  timezone: '检测到时区变化，已按新的本地日期整理',
  both: '日期和时区都变了，已按新的本地时间整理',
}

export default function App() {
  const status = useAppStore((state) => state.status)
  const error = useAppStore((state) => state.error)
  const hydrate = useAppStore((state) => state.hydrate)
  const refreshForToday = useAppStore((state) => state.refreshForToday)

  const activeTab = useUiStore((state) => state.activeTab)
  const isProfileEditorOpen = useUiStore(
    (state) => state.isProfileEditorOpen,
  )
  const profileEditorStartStep = useUiStore(
    (state) => state.profileEditorStartStep,
  )
  const showToast = useUiStore((state) => state.showToast)

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  useEffect(() => {
    if (status !== 'ready') {
      return
    }

    let refreshing = false
    let snapshot = readClockSnapshot()

    const checkClock = () => {
      if (refreshing) {
        return
      }

      const current = readClockSnapshot()
      const change = detectClockChange(snapshot, current)
      if (change === 'none') {
        return
      }

      snapshot = current
      refreshing = true
      void refreshForToday()
        .then(() => {
          showToast(CLOCK_CHANGE_MESSAGES[change])
        })
        .catch(() => {
          // 真正的持久化错误由 store 的 status 进入 BootScreen。
        })
        .finally(() => {
          refreshing = false
        })
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkClock()
      }
    }

    window.addEventListener('focus', checkClock)
    document.addEventListener('visibilitychange', handleVisibility)
    const interval = window.setInterval(checkClock, 60_000)

    return () => {
      window.removeEventListener('focus', checkClock)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.clearInterval(interval)
    }
  }, [refreshForToday, showToast, status])

  if (status === 'idle' || status === 'loading') {
    return <BootScreen status="loading" />
  }

  if (status === 'error') {
    return (
      <BootScreen
        status="error"
        error={error}
        onRetry={() => {
          void hydrate()
        }}
      />
    )
  }

  return (
    <>
      <div className="app-shell">
        <main className="app-main">
          {activeTab === 'today' && <TodayPage />}
          {activeTab === 'calendar' && <CalendarPage />}
          {activeTab === 'stamps' && <StampBookPage />}
          {activeTab === 'settings' && <SettingsPage />}
        </main>
        <TabBar />
        <AdModalHost />
        {isProfileEditorOpen && (
          <ProfilePage initialStep={profileEditorStartStep} />
        )}
      </div>
      <ToastHost />
    </>
  )
}
