import { useUiStore, type TabKey } from '@/store/useUiStore'
import { TabIcon } from './TabIcon'

const TABS: readonly { key: TabKey; label: string }[] = [
  { key: 'today', label: '今日' },
  { key: 'calendar', label: '日历' },
  { key: 'stamps', label: '图鉴' },
  { key: 'settings', label: '设置' },
]

export function TabBar() {
  const activeTab = useUiStore((state) => state.activeTab)
  const setActiveTab = useUiStore((state) => state.setActiveTab)

  return (
    <nav className="tab-bar" aria-label="主导航">
      <div className="tab-bar__inner">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              type="button"
              className={`tab-item${isActive ? ' is-active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
              aria-current={isActive ? 'page' : undefined}
            >
              <TabIcon name={tab.key} />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
