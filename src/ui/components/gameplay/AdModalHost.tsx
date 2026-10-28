import { useSyncExternalStore } from 'react'

import { mockAdProvider } from '../../ads/MockAdProvider'
import { ModalShell } from './ModalShell'

export function AdModalHost() {
  const snapshot = useSyncExternalStore(
    mockAdProvider.subscribe,
    mockAdProvider.getSnapshot,
    mockAdProvider.getSnapshot,
  )

  if (!snapshot.open) {
    return null
  }

  const elapsed = snapshot.totalSeconds - snapshot.secondsLeft
  const progress = Math.min(1, elapsed / snapshot.totalSeconds)

  return (
    <ModalShell
      title="吃完这口就有新卡"
      description="模拟广告 · 看满倒计时，才能多抽一张。"
      className="ad-modal"
      scrimClassName="modal-scrim--ad"
      onClose={mockAdProvider.closeEarly}
      footer={
        <button
          type="button"
          className="secondary-button ad-close"
          onClick={mockAdProvider.closeEarly}
        >
          关闭广告
        </button>
      }
    >
      <div className="ad-art" aria-hidden="true">
        <span className="ad-art__tape" />
        <span className="ad-art__emoji">🍮</span>
        <p className="ad-art__title">一口布丁，灵感满格</p>
        <p className="ad-art__sub">这是占位广告，不联网、不追踪。</p>
      </div>

      <div
        className="ad-progress"
        role="progressbar"
        aria-label="广告播放进度"
        aria-valuemin={0}
        aria-valuemax={snapshot.totalSeconds}
        aria-valuenow={elapsed}
      >
        <span
          className="ad-progress__fill"
          style={{ transform: `scaleX(${progress})` }}
        />
      </div>

      <p className="ad-countdown" aria-live="off">
        还剩 <strong>{snapshot.secondsLeft}</strong> 秒
      </p>
      <p className="sheet-note">
        中途关闭不算看完，本次抽卡不会消耗任何次数。
      </p>
    </ModalShell>
  )
}
