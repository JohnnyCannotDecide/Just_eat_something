import { AD } from '@/config/gameConfig'
import type { AdProvider } from '@/core/adProvider'

export interface AdSnapshot {
  open: boolean
  secondsLeft: number
  totalSeconds: number
}

type Listener = () => void

/**
 * 模拟激励广告：5 秒倒计时，完整看完才返回 true；
 * 中途关闭、按 Esc 或点遮罩都会返回 false，且不会被后续计时改成 true。
 */
export class MockAdProvider implements AdProvider {
  private readonly totalSeconds: number
  private snapshot: AdSnapshot
  private readonly listeners = new Set<Listener>()
  private timer: ReturnType<typeof setInterval> | null = null
  private settle: ((completed: boolean) => void) | null = null
  private pending: Promise<boolean> | null = null

  constructor(countdownSeconds: number = AD.mockCountdownSeconds) {
    this.totalSeconds = Math.max(
      1,
      Math.floor(Number.isFinite(countdownSeconds) ? countdownSeconds : 1),
    )
    this.snapshot = {
      open: false,
      secondsLeft: this.totalSeconds,
      totalSeconds: this.totalSeconds,
    }
  }

  readonly getSnapshot = (): AdSnapshot => this.snapshot

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  readonly showRewardedAd = (): Promise<boolean> => {
    if (this.pending) {
      return this.pending
    }

    this.pending = new Promise<boolean>((resolve) => {
      this.settle = resolve
      this.setSnapshot({
        open: true,
        secondsLeft: this.totalSeconds,
        totalSeconds: this.totalSeconds,
      })
      this.timer = setInterval(() => {
        const secondsLeft = this.snapshot.secondsLeft - 1
        if (secondsLeft <= 0) {
          this.finish(true)
          return
        }
        this.setSnapshot({ ...this.snapshot, secondsLeft })
      }, 1000)
    })

    return this.pending
  }

  /** 用户中途关闭广告，返回 false。 */
  readonly closeEarly = (): void => {
    if (!this.snapshot.open) {
      return
    }
    this.finish(false)
  }

  /** 清理计时器与订阅，主要供测试和页面卸载使用。 */
  readonly dispose = (): void => {
    if (this.snapshot.open) {
      this.finish(false)
    }
    this.listeners.clear()
  }

  private setSnapshot(next: AdSnapshot): void {
    this.snapshot = next
    for (const listener of this.listeners) {
      listener()
    }
  }

  private finish(completed: boolean): void {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }

    const resolve = this.settle
    this.settle = null
    this.pending = null
    this.setSnapshot({
      open: false,
      secondsLeft: this.totalSeconds,
      totalSeconds: this.totalSeconds,
    })
    resolve?.(completed)
  }
}

export const mockAdProvider = new MockAdProvider()
