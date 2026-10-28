interface BootScreenProps {
  status: 'loading' | 'error'
  error?: string | null
  onRetry?: () => void
}

export function BootScreen({ status, error, onRetry }: BootScreenProps) {
  const isError = status === 'error'

  return (
    <main
      className={`boot-screen boot-screen--${status}`}
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
    >
      <div className="boot-screen__mark" aria-hidden="true">
        <span className="boot-screen__steam">〰</span>
        <span className="boot-screen__emoji">🍱</span>
        <span className="boot-screen__strap" />
      </div>

      {isError ? (
        <>
          <p className="boot-screen__kicker">便当手帐</p>
          <h1>便当盒卡住了</h1>
          <p className="boot-screen__hint">
            暂时读不到你的记录，再试一次就好。
          </p>
          {error && <p className="boot-screen__detail">{error}</p>}
          <button type="button" className="primary-button" onClick={onRetry}>
            再试一次
          </button>
        </>
      ) : (
        <>
          <p className="boot-screen__kicker">便当手帐</p>
          <h1>正在把便当摆好…</h1>
          <p className="boot-screen__hint">热一热米饭，摆好小菜。</p>
          <span className="boot-screen__dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </>
      )}
    </main>
  )
}
