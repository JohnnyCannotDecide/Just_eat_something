import { useState } from 'react'
import type { CSSProperties } from 'react'

import { STAMP_TIER_META } from '@/config/gameConfig'
import { getStampTierLabel } from '@/core/stamps'
import type { CheckInReceipt } from '@/store/useAppStore'

import {
  stampUpgradeMessage,
  stampUpgradePath,
} from '../../copy'
import { formatKcal } from '../../formatKcal'
import { formatShortDate } from '../../selectors/todayView'
import { DishStamp } from '../stamp/DishStamp'
import { ModalShell } from './ModalShell'

interface RewardOverlayProps {
  receipt: CheckInReceipt
  showCalories: boolean
  onClose: () => void
}

export function RewardOverlay({
  receipt,
  showCalories,
  onClose,
}: RewardOverlayProps) {
  const [index, setIndex] = useState(0)
  const [finished, setFinished] = useState(receipt.stamps.length === 0)
  const [reduceMotion] = useState(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const stamp = receipt.stamps[index] ?? null
  const tierLabel = stamp ? getStampTierLabel(stamp.tier) : null
  const previousLabel = stamp?.previousTier
    ? getStampTierLabel(stamp.previousTier)
    : null
  const upgraded = Boolean(stamp?.upgraded && previousLabel)
  const stampMeta = stamp ? STAMP_TIER_META[stamp.tier] : null
  const upgradeStyle = stampMeta
    ? ({
        '--stamp-color': stampMeta.color,
        '--stamp-soft': stampMeta.soft,
      } as CSSProperties)
    : undefined
  const eaten = receipt.components.filter((component) => component.eaten)
  const tokenText = receipt.tokenRewarded
    ? `🎟️ 抽卡券 +1`
    : receipt.rewardKind === 'custom'
      ? '今天已经领过自定义记录的券啦'
      : '本餐没有额外的抽卡券'

  const footer = finished ? (
    <button type="button" className="primary-button" onClick={onClose}>
      收下这顿饭
    </button>
  ) : (
    <>
      <button
        type="button"
        className="secondary-button"
        onClick={() => setFinished(true)}
      >
        跳过
      </button>
      <button
        type="button"
        className="primary-button"
        onClick={() => {
          if (index + 1 >= receipt.stamps.length) {
            setFinished(true)
          } else {
            setIndex(index + 1)
          }
        }}
      >
        {index + 1 >= receipt.stamps.length
          ? '看看本餐'
          : `下一枚 ${index + 1}/${receipt.stamps.length}`}
      </button>
    </>
  )

  return (
    <ModalShell
      title={
        finished
          ? '这餐收好啦'
          : upgraded
            ? '印章升级啦'
            : '盖好章啦'
      }
      description={
        finished
          ? '本餐的部件、热量和奖励都记下了。'
          : upgraded
            ? '这枚印章又长大了一圈，图鉴里也亮起来了。'
            : '这一餐已经锁进小票，印章收进图鉴。'
      }
      className="reward-overlay"
      scrimClassName="modal-scrim--reward"
      onClose={onClose}
      footer={footer}
    >
      {finished ? (
        <div className="reward-stage reward-stage--summary">
          <p className="reward-summary__name">{receipt.name}</p>

          <ul className="reward-summary__components">
            {eaten.length === 0 ? (
              <li>这餐没有勾选吃掉的部件</li>
            ) : (
              eaten.map((component) => (
                <li key={component.id}>
                  <span>{component.name}</span>
                  <small>
                    {component.kind === 'custom'
                      ? '1 份'
                      : `${component.grams ?? 0} g`}
                  </small>
                </li>
              ))
            )}
          </ul>

          {receipt.calories === null ? (
            <p className="reward-kcal">
              这条记录没有填热量，不计入合计
            </p>
          ) : (
            <p className="reward-kcal">
              <strong>{formatKcal(receipt.calories, showCalories)}</strong>{' '}
              kcal 已计入今天
            </p>
          )}

          <p className="reward-detail">
            {receipt.stamps.length > 0
              ? `本餐获得 ${receipt.stamps.length} 枚印章`
              : '本餐没有生成印章'}
          </p>

          <span
            className={`reward-token${
              receipt.tokenRewarded ? '' : ' reward-token--quiet'
            }`}
          >
            {tokenText}
          </span>
        </div>
      ) : stamp ? (
        <div className="reward-stage">
          <DishStamp
            dish={stamp.dish}
            count={stamp.count}
            tier={stamp.tier}
            dateLabel={formatShortDate(stamp.dateKey)}
            size="lg"
            animate={!reduceMotion}
            tilt={-6}
          />

          <p className="reward-name">{stamp.dish.name}</p>
          <p className="reward-kcal">
            <strong>{formatKcal(receipt.calories, showCalories)}</strong>{' '}
            kcal 已计入今天
          </p>

          {tierLabel && (
            <p className="reward-detail">
              第 {stamp.count} 次吃它，{tierLabel}级印章
            </p>
          )}

          {upgraded && tierLabel && previousLabel && (
            <p className="reward-upgrade" style={upgradeStyle} role="status">
              <span className="reward-upgrade__spark" aria-hidden="true">
                ✨
              </span>
              <strong>{stampUpgradeMessage(tierLabel)}</strong>
              <span className="reward-upgrade__path">
                {stampUpgradePath(previousLabel, tierLabel)}
              </span>
            </p>
          )}

          <span
            className={`reward-token${
              receipt.tokenRewarded ? '' : ' reward-token--quiet'
            }`}
          >
            {tokenText}
          </span>
        </div>
      ) : null}
    </ModalShell>
  )
}
