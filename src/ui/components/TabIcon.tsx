import type { TabKey } from '@/store/useUiStore'

interface TabIconProps {
  name: TabKey
}

export function TabIcon({ name }: TabIconProps) {
  return (
    <svg
      className="tab-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {name === 'today' && (
        <>
          <rect x="3.4" y="5.2" width="17.2" height="14.3" rx="4.2" />
          <path d="M3.8 9.4h16.4M9.4 9.6v9.4" />
          <path d="M6.1 7.3h.01M8 7.3h.01" />
          <path d="M13 12.1h4.2M13 15.2h2.8" />
        </>
      )}
      {name === 'calendar' && (
        <>
          <rect x="3.4" y="5.2" width="17.2" height="14.6" rx="4.2" />
          <path d="M3.8 9.4h16.4M8.2 3.9v2.6M15.8 3.9v2.6" />
          <circle cx="8.1" cy="13" r="1.05" />
          <circle cx="12" cy="13" r="1.05" />
          <circle cx="15.9" cy="13" r="1.05" />
        </>
      )}
      {name === 'stamps' && (
        <>
          <rect
            x="4.2"
            y="4.2"
            width="15.6"
            height="15.6"
            rx="2.4"
            strokeDasharray="2.1 2.1"
          />
          <circle cx="12" cy="12" r="3.3" />
          <path d="M12 8.7v-.01M12 15.3v-.01" />
        </>
      )}
      {name === 'settings' && (
        <>
          <path d="M4.4 7.5h15.2M4.4 12h15.2M4.4 16.5h15.2" />
          <circle
            cx="9"
            cy="7.5"
            r="2.1"
            fill="var(--tab-icon-bg, #FFFCF6)"
          />
          <circle
            cx="15.2"
            cy="12"
            r="2.1"
            fill="var(--tab-icon-bg, #FFFCF6)"
          />
          <circle
            cx="8.2"
            cy="16.5"
            r="2.1"
            fill="var(--tab-icon-bg, #FFFCF6)"
          />
        </>
      )}
    </svg>
  )
}
