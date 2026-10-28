import { useId } from 'react'

import { RARITY_META } from '@/config/gameConfig'
import { getStampTierLabel } from '@/core/stamps'

import {
  stampFirstTierMessage,
  stampNextTierMessage,
} from '../../copy'
import { formatKcal } from '../../formatKcal'
import type { StampBookEntry } from '../../selectors/stampBookView'
import { ModalShell } from '../gameplay/ModalShell'
import { DishStamp } from './DishStamp'

interface StampDetailModalProps {
  entry: StampBookEntry
  showCalories: boolean
  onClose: () => void
  /** 自制菜（未归档）才提供编辑/删除。 */
  onEdit?: () => void
  onDelete?: () => void
}

export function StampDetailModal({
  entry,
  showCalories,
  onClose,
  onEdit,
  onDelete,
}: StampDetailModalProps) {
  const ingredientsId = useId()
  const cookingId = useId()
  const rarity = RARITY_META[entry.rarity]
  const nextTierLabel = entry.nextTier
    ? getStampTierLabel(entry.nextTier)
    : null

  const editable = entry.isCustom && !entry.archived
  const kcalText =
    entry.kcal === null || (!entry.collected && !entry.isCustom)
      ? '—'
      : `${formatKcal(entry.kcal, showCalories)} kcal`

  return (
    <ModalShell
      variant="sheet"
      title={entry.name}
      description={`${rarity.label} 稀有度 · ${
        entry.archived
          ? '已归档'
          : entry.collected
            ? `${entry.tierLabel}章`
            : '尚未收集'
      }`}
      className="stamp-detail-modal"
      onClose={onClose}
      footer={
        <>
          {editable && onEdit && (
            <button
              type="button"
              className="secondary-button"
              onClick={onEdit}
            >
              编辑菜谱
            </button>
          )}
          {editable && onDelete && (
            <button
              type="button"
              className="danger-button"
              onClick={onDelete}
            >
              删除
            </button>
          )}
          <button
            type="button"
            className="primary-button"
            onClick={onClose}
          >
            收好图鉴
          </button>
        </>
      }
    >
      <div className="stamp-detail">
        <div className="stamp-detail__hero">
          <DishStamp
            dish={entry}
            count={entry.count}
            tier={entry.tier}
            dateLabel={entry.collected ? entry.dateLabel : undefined}
            size="lg"
          />
          {entry.archived && (
            <p className="stamp-detail__locked">
              已归档：不会再被抽到，历史记录仍然保留。
            </p>
          )}
          {!entry.archived && !entry.collected && (
            <p className="stamp-detail__locked">
              打卡这道菜，就能点亮它。
            </p>
          )}
        </div>

        <dl className="stamp-detail__facts">
          <div>
            <dt>热量</dt>
            <dd>{kcalText}</dd>
          </div>
          <div>
            <dt>印章等级</dt>
            <dd>
              {entry.collected ? `${entry.tierLabel}章` : '—'}
            </dd>
          </div>
          <div>
            <dt>累计打卡</dt>
            <dd>{entry.collected ? `${entry.count} 次` : '—'}</dd>
          </div>
          <div>
            <dt>首次获得</dt>
            <dd>{entry.firstCheckInLabel || '—'}</dd>
          </div>
        </dl>

        {entry.tip && <p className="stamp-detail__tip">{entry.tip}</p>}

        <section
          className="stamp-detail__ingredients"
          aria-labelledby={ingredientsId}
        >
          <h3 id={ingredientsId}>食材清单</h3>
          {entry.ingredients.length === 0 ? (
            <p className="sheet-note">这道菜只记了总热量。</p>
          ) : (
            <ul className="stamp-ingredient-list">
              {entry.ingredients.map((ingredient) => (
                <li key={ingredient.id} className="stamp-ingredient">
                  <span className="stamp-ingredient__name">
                    {ingredient.name}
                    <small className="stamp-ingredient__meta">
                      {formatKcal(ingredient.kcalPer100g, showCalories)}{' '}
                      kcal / 100g
                    </small>
                  </span>
                  <span className="stamp-ingredient__grams">
                    {ingredient.grams} g
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {entry.cooking && (
          <section
            className="stamp-detail__ingredients"
            aria-labelledby={cookingId}
          >
            <h3 id={cookingId}>做法</h3>
            <details className="stamp-detail__cooking">
              <summary>
                {entry.cooking.method} · 约 {entry.cooking.timeMinutes} 分钟
              </summary>
              <ol className="stamp-detail__steps">
                {entry.cooking.steps.map((step, index) => (
                  <li key={`${index}-${step}`}>{step}</li>
                ))}
              </ol>
              {entry.cooking.tips && (
                <p className="sheet-note">{entry.cooking.tips}</p>
              )}
            </details>
          </section>
        )}

        {entry.nextTier &&
          entry.remainingToNext !== null &&
          nextTierLabel && (
            <p className="stamp-detail__next">
              {entry.collected
                ? stampNextTierMessage(
                    entry.remainingToNext,
                    nextTierLabel,
                  )
                : stampFirstTierMessage(
                    entry.remainingToNext,
                    nextTierLabel,
                  )}
            </p>
          )}
      </div>
    </ModalShell>
  )
}
