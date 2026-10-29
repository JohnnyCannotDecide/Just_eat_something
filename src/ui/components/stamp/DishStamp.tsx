import { useId, useState } from 'react'
import type { CSSProperties } from 'react'

import { RARITY_META } from '@/config/gameConfig'
import { getStampTierLabel } from '@/core/stamps'
import type { StampDishSnapshot, StampTier } from '@/core/types'

import { getDishEmoji } from '../../dishEmoji'
import { useImageUrl } from '../../images/useImageUrl'
import { getStampImageSources, getStampTilt } from './stampVisual'

export type DishStampSize = 'sm' | 'md' | 'lg'

interface DishStampProps {
  dish: StampDishSnapshot
  count: number
  tier: StampTier | null
  dateLabel?: string
  size?: DishStampSize
  animate?: boolean
  /** 放在已有可访问名称的按钮内时，隐藏印章自身的语义。 */
  ariaHidden?: boolean
  tilt?: number
  className?: string
  /** 自制菜没有官方 emoji 表项时，传入菜谱自带的图标。 */
  emoji?: string
  /**
   * 图鉴未收集的官方菜：强制剪影，且不使用任何真实图片 / 菜品 emoji。
   * 显式传 false 时，即使没有印章也按已解锁样式渲染（自制菜）。
   * 不传时沿用旧行为：没有印章即剪影。
   */
  locked?: boolean
}

interface StampArtProps {
  sources: string[]
  clipId: string
  emoji: string
}

function formatCount(count: number): string {
  const normalized = Number.isFinite(count)
    ? Math.max(0, Math.floor(count))
    : 0
  return normalized > 99 ? '99+' : String(normalized)
}

function StampArt({ sources, clipId, emoji }: StampArtProps) {
  const [sourceIndex, setSourceIndex] = useState(0)
  const source = sources[sourceIndex]

  if (!source) {
    return (
      <text
        x="50"
        y="48"
        className="dish-stamp__emoji"
        textAnchor="middle"
        dominantBaseline="central"
        aria-hidden="true"
      >
        {emoji}
      </text>
    )
  }

  return (
    <image
      href={source}
      x="25"
      y="22"
      width="50"
      height="50"
      preserveAspectRatio="xMidYMid slice"
      clipPath={`url(#${clipId})`}
      onError={() => setSourceIndex((index) => index + 1)}
      aria-hidden="true"
    />
  )
}

/**
 * 用内联 SVG 渲染印章：等级圆环、圆形菜品图、日期、稀有度与次数。
 * 图片按上传图 → stampImage → image → emoji 依次回退。
 */
export function DishStamp({
  dish,
  count,
  tier,
  dateLabel,
  size = 'md',
  animate = false,
  ariaHidden = false,
  tilt,
  className,
  emoji: emojiOverride,
  locked,
}: DishStampProps) {
  const rawId = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const clipId = `stamp-clip-${rawId}`
  const grainId = `stamp-grain-${rawId}`

  const isLocked = locked === true
  const silhouette = locked ?? tier === null
  const rarity = RARITY_META[dish.rarity]
  const uploaded = useImageUrl(isLocked ? undefined : dish.imageId)
  const sources = isLocked ? [] : getStampImageSources(dish, uploaded)
  const emoji = isLocked
    ? ''
    : (emojiOverride ?? dish.emoji ?? getDishEmoji(dish.id))
  const tierLabel = tier ? getStampTierLabel(tier) : null
  const countText = `×${formatCount(count)}`

  const style = {
    '--stamp-tilt': `${tilt ?? getStampTilt(dish.id)}deg`,
  } as CSSProperties

  const label = isLocked
    ? '未收集的印章'
    : tier
      ? `${dish.name}印章，${tierLabel}级，累计打卡 ${count} 次${
          dateLabel ? `，最近 ${dateLabel}` : ''
        }`
      : `${dish.name}印章，尚未收集`

  const classes = [
    'dish-stamp',
    `dish-stamp--${size}`,
    isLocked
      ? 'dish-stamp--locked'
      : silhouette
        ? 'dish-stamp--silhouette'
        : '',
    animate ? 'dish-stamp--animate' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <span
      className={classes}
      style={style}
      data-rarity={dish.rarity}
      data-tier={tier ?? 'locked'}
      role={ariaHidden ? undefined : 'img'}
      aria-label={ariaHidden ? undefined : label}
      aria-hidden={ariaHidden ? true : undefined}
    >
      <svg
        viewBox="0 0 100 100"
        role="presentation"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <clipPath id={clipId}>
            <circle cx="50" cy="47" r="25" />
          </clipPath>
          <pattern
            id={grainId}
            width="4"
            height="4"
            patternUnits="userSpaceOnUse"
          >
            <circle
              cx="1"
              cy="1.1"
              r="0.38"
              className="dish-stamp__grain"
              opacity="0.2"
            />
            <circle
              cx="3.1"
              cy="2.6"
              r="0.26"
              className="dish-stamp__grain-ink"
              opacity="0.12"
            />
            <circle
              cx="2.1"
              cy="3.5"
              r="0.18"
              className="dish-stamp__grain"
              opacity="0.16"
            />
          </pattern>
        </defs>

        <circle
          cx="50"
          cy="50"
          r="46.5"
          className="dish-stamp__ring"
          strokeWidth="2.6"
        />
        <circle
          cx="50"
          cy="50"
          r="46"
          fill={`url(#${grainId})`}
          opacity={silhouette ? 0.28 : 0.58}
        />
        <circle
          cx="50"
          cy="50"
          r="40"
          className="dish-stamp__rings"
          strokeWidth="1"
          strokeDasharray="2.6 3.2"
          opacity="0.48"
        />
        {tier && (
          <g className="dish-stamp__ticks" aria-hidden="true">
            {tier === 'gold' && (
              <>
                <path d="M88 34 L93 32" />
                <path d="M92 50 L97 50" />
                <path d="M88 66 L93 68" />
              </>
            )}
            {tier === 'silver' && (
              <>
                <path d="M88 34 L93 32" />
                <path d="M88 66 L93 68" />
              </>
            )}
            {tier === 'bronze' && <path d="M92 50 L97 50" />}
          </g>
        )}

        <g
          className="dish-stamp__art"
          opacity={silhouette ? 0.52 : 1}
        >
          <circle cx="50" cy="47" r="25" className="dish-stamp__backdrop" />
          {isLocked ? (
            <g className="dish-stamp__locked-art">
              <path d="M29 44h42a21 21 0 0 1-42 0Z" />
              <rect x="45.5" y="38.5" width="9" height="5" rx="2.5" />
              <path
                d="M37 36.5c0-3 2.5-4.5 5-4.5M50 34c0-3.5 3-5.5 6-5M61 37c0-2.5 2-4 4.5-4"
                fill="none"
                strokeWidth="1.6"
                strokeLinecap="round"
                opacity="0.7"
              />
            </g>
          ) : (
            <StampArt
              key={`${dish.id}-${sources.join('|')}`}
              sources={sources}
              clipId={clipId}
              emoji={emoji}
            />
          )}
        </g>
        <circle
          cx="50"
          cy="47"
          r="25"
          className="dish-stamp__art-ring"
          strokeWidth="1.6"
          opacity="0.72"
        />

        {!silhouette && (
          <>
            <rect
              x="53"
              y="13.5"
              width="24"
              height="11"
              rx="5.5"
              className="dish-stamp__rarity-badge"
            />
            <text
              x="65"
              y="21.4"
              className="dish-stamp__rarity"
              textAnchor="middle"
            >
              {rarity.label}
            </text>

            <circle cx="26" cy="77" r="8.5" className="dish-stamp__count-bg" />
            <text
              x="26"
              y="80.2"
              className="dish-stamp__count"
              textAnchor="middle"
            >
              {countText}
            </text>
          </>
        )}

        {!silhouette && dateLabel && (
          <text
            x="50"
            y="85.5"
            className="dish-stamp__date"
            textAnchor="middle"
          >
            {dateLabel}
          </text>
        )}
      </svg>
    </span>
  )
}
