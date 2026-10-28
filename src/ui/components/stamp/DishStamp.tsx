import { useId, useState } from 'react'
import type { CSSProperties } from 'react'

import { RARITY_META, STAMP_TIER_META } from '@/config/gameConfig'
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
}: DishStampProps) {
  const rawId = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const clipId = `stamp-clip-${rawId}`
  const grainId = `stamp-grain-${rawId}`

  const meta = tier ? STAMP_TIER_META[tier] : null
  const ringColor = meta?.color ?? '#B9AD9C'
  const softColor = meta?.soft ?? '#F3EDE3'
  const silhouette = tier === null
  const rarity = RARITY_META[dish.rarity]
  const uploaded = useImageUrl(dish.imageId)
  const sources = getStampImageSources(dish, uploaded)
  const emoji = emojiOverride ?? dish.emoji ?? getDishEmoji(dish.id)
  const tierLabel = tier ? getStampTierLabel(tier) : null
  const countText = `×${formatCount(count)}`

  const style = {
    '--stamp-color': ringColor,
    '--stamp-soft': softColor,
    '--stamp-tilt': `${tilt ?? getStampTilt(dish.id)}deg`,
    '--stamp-rarity': rarity.color,
  } as CSSProperties

  const label = tier
    ? `${dish.name}印章，${tierLabel}级，累计打卡 ${count} 次${
        dateLabel ? `，最近 ${dateLabel}` : ''
      }`
    : `${dish.name}印章，尚未收集`

  const classes = [
    'dish-stamp',
    `dish-stamp--${size}`,
    silhouette ? 'dish-stamp--silhouette' : '',
    animate ? 'dish-stamp--animate' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <span
      className={classes}
      style={style}
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
              fill={ringColor}
              opacity="0.2"
            />
            <circle
              cx="3.1"
              cy="2.6"
              r="0.26"
              fill="#6B482A"
              opacity="0.12"
            />
            <circle
              cx="2.1"
              cy="3.5"
              r="0.18"
              fill={ringColor}
              opacity="0.16"
            />
          </pattern>
        </defs>

        <circle
          cx="50"
          cy="50"
          r="46.5"
          fill={softColor}
          stroke={ringColor}
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
          fill="none"
          stroke={ringColor}
          strokeWidth="1"
          strokeDasharray="2.6 3.2"
          opacity="0.48"
        />

        <g
          className="dish-stamp__art"
          opacity={silhouette ? 0.52 : 1}
        >
          <circle
            cx="50"
            cy="47"
            r="25"
            fill={silhouette ? '#E7DED0' : '#FFFDF8'}
          />
          <StampArt
            key={`${dish.id}-${sources.join('|')}`}
            sources={sources}
            clipId={clipId}
            emoji={emoji}
          />
        </g>
        <circle
          cx="50"
          cy="47"
          r="25"
          fill="none"
          stroke={ringColor}
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
              fill={rarity.color}
            />
            <text
              x="65"
              y="21.4"
              className="dish-stamp__rarity"
              textAnchor="middle"
              fill="#FFFDF8"
            >
              {rarity.label}
            </text>

            <circle cx="26" cy="77" r="8.5" fill={ringColor} />
            <text
              x="26"
              y="80.2"
              className="dish-stamp__count"
              textAnchor="middle"
              fill="#FFFDF8"
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
            fill={ringColor}
          >
            {dateLabel}
          </text>
        )}
      </svg>
    </span>
  )
}
