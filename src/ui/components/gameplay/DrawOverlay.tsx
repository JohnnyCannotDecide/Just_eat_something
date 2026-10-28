import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'

import { RARITY_META } from '@/config/gameConfig'
import { calcMealCalories } from '@/core/components'
import type { DrawReceipt } from '@/store/useAppStore'

import { DRAW_SOURCE_LABELS } from '../../copy'
import { getDishEmoji } from '../../dishEmoji'
import { formatKcal } from '../../formatKcal'
import { DishThumb } from '../today/DishThumb'
import { ModalShell } from './ModalShell'

interface DrawOverlayProps {
  receipt: DrawReceipt
  showCalories: boolean
  onClose: () => void
}

const FLIP_DELAY_MS = 600

export function DrawOverlay({
  receipt,
  showCalories,
  onClose,
}: DrawOverlayProps) {
  const [revealed, setRevealed] = useState(false)
  const rarity = RARITY_META[receipt.candidate.rarity]
  const kcal = calcMealCalories(receipt.candidate.components)
  const components = receipt.candidate.components.filter(
    (component) => !component.discarded,
  )
  const style = {
    '--rarity-color': rarity.color,
    '--rarity-glow': rarity.glow,
  } as CSSProperties

  useEffect(() => {
    if (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setRevealed(true)
      return
    }

    const timer = window.setTimeout(() => setRevealed(true), FLIP_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <ModalShell
      title="翻到一份套餐"
      description="这份已经放进本餐的候选池啦。"
      className="draw-overlay"
      onClose={onClose}
      footer={
        <button type="button" className="primary-button" onClick={onClose}>
          收下这份
        </button>
      }
    >
      <p className="sr-only" role="status">
        {revealed
          ? `抽到 ${receipt.candidate.name}，${rarity.label} 稀有度，约 ${formatKcal(
              kcal,
              showCalories,
            )} 千卡`
          : '正在翻卡'}
      </p>

      <div className="draw-stage">
        <button
          type="button"
          className={`draw-card draw-card--${receipt.candidate.rarity.toLowerCase()}${
            revealed ? ' is-flipped' : ''
          }`}
          style={style}
          onClick={() => setRevealed(true)}
          aria-label={
            revealed
              ? `${receipt.candidate.name}，${rarity.label} 稀有度`
              : '抽到的套餐，点击翻开'
          }
        >
          <span className="draw-card__inner">
            <span className="draw-card__face draw-card__face--back">
              <span className="draw-card__back-mark" aria-hidden="true">
                ?
              </span>
              <span className="draw-card__back-label">今日套餐</span>
            </span>

            <span
              className="draw-card__face draw-card__face--front"
              aria-hidden={!revealed}
            >
              <span className="draw-card__rarity">{rarity.label}</span>
              <span className="draw-card__name">{receipt.candidate.name}</span>
              <span className="draw-card__combo-thumbs" aria-hidden="true">
                {components.slice(0, 4).map((component) => (
                  <span key={component.id} className="draw-card__combo-thumb">
                    <DishThumb
                      image={component.image}
                      imageId={component.imageId}
                      emoji={
                        component.emoji ??
                        (component.kind === 'custom'
                          ? '🍽️'
                          : getDishEmoji(component.dishId ?? component.id))
                      }
                    />
                  </span>
                ))}
              </span>
              <span className="draw-card__meta">
                {formatKcal(kcal, showCalories)} kcal · {components.length}{' '}
                个部件
              </span>
              {receipt.candidate.tip && (
                <span className="draw-card__tip">
                  {receipt.candidate.tip}
                </span>
              )}
            </span>
          </span>
        </button>
      </div>

      <div className="draw-result">
        <span className="draw-result__chip">
          {DRAW_SOURCE_LABELS[receipt.source]} · 剩余{' '}
          {receipt.tokenCount} 张券
        </span>
        {receipt.pityTriggered && (
          <span className="draw-result__chip draw-result__chip--pity">
            ✨ 保底出现啦
          </span>
        )}
      </div>

      <details className="draw-combo-details">
        <summary>这餐怎么做</summary>
        <ul>
          {components.map((component) => (
            <li key={component.id}>
              <strong>{component.name}</strong>
              {component.cooking ? (
                <span>
                  {component.cooking.method} · 约{' '}
                  {component.cooking.timeMinutes} 分钟
                  {component.cooking.steps.length > 0 && (
                    <small>{component.cooking.steps.join('；')}</small>
                  )}
                </span>
              ) : (
                <span>自定义记录，没有做法步骤</span>
              )}
            </li>
          ))}
        </ul>
      </details>
    </ModalShell>
  )
}
