import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'

import { STAMP_TIERS, STAMP_TIER_META } from '@/config/gameConfig'
import {
  hasAnySnapshotReference,
  hasCheckInRecords,
} from '@/core/customDish'
import type { CustomDish } from '@/core/types'
import { ingredients as officialIngredients } from '@/data'
import { useAppStore } from '@/store/useAppStore'
import type { CustomDishInput } from '@/store/useAppStore'
import { useUiStore } from '@/store/useUiStore'

import { ConfirmDialog } from '../components/gameplay/ConfirmDialog'
import { CustomDishSheet } from '../components/stamp/CustomDishSheet'
import { DishStamp } from '../components/stamp/DishStamp'
import { StampDetailModal } from '../components/stamp/StampDetailModal'
import { stampBookCardLabel } from '../copy'
import { isCaloriesVisible } from '../formatKcal'
import { buildStampBookView } from '../selectors/stampBookView'
import type { StampBookFilter } from '../selectors/stampBookView'

const FILTERS: readonly { key: StampBookFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'collected', label: '已收集' },
  { key: 'custom', label: '自制' },
]

type SheetState =
  | { kind: 'create' }
  | { kind: 'edit'; dish: CustomDish }
  | null

export function StampBookPage() {
  const data = useAppStore((state) => state.data)
  const showToast = useUiStore((state) => state.showToast)

  const [filter, setFilter] = useState<StampBookFilter>('all')
  const [selectedDishId, setSelectedDishId] = useState<string | null>(null)
  const [sheet, setSheet] = useState<SheetState>(null)
  const [deleteTarget, setDeleteTarget] = useState<CustomDish | null>(null)
  const [pending, setPending] = useState(false)
  const [sheetError, setSheetError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const view = useMemo(
    () =>
      buildStampBookView(
        {
          stamps: data.stamps,
          customDishes: data.customDishes,
        },
        filter,
      ),
    [data.customDishes, data.stamps, filter],
  )

  const selectedEntry = selectedDishId
    ? (view.entries.find((entry) => entry.id === selectedDishId) ?? null)
    : null
  const selectedCustom = selectedEntry
    ? (data.customDishes.find((dish) => dish.id === selectedEntry.id) ??
      null)
    : null

  const willArchive = deleteTarget
    ? hasCheckInRecords(data, deleteTarget.id) ||
      hasAnySnapshotReference(data, { dishId: deleteTarget.id })
    : false

  const openCreate = () => {
    setSheetError(null)
    setSheet({ kind: 'create' })
  }

  const openEdit = (dish: CustomDish) => {
    setSheetError(null)
    setSheet({ kind: 'edit', dish })
  }

  const handleSubmit = async (input: CustomDishInput) => {
    setPending(true)
    setSheetError(null)
    try {
      const store = useAppStore.getState()
      const result =
        sheet?.kind === 'edit'
          ? await store.updateCustomDish(sheet.dish.id, input)
          : await store.createCustomDish(input)

      if (result.status === 'saved') {
        const editing = sheet?.kind === 'edit'
        setSheet(null)
        setSelectedDishId(result.dishId)
        setFilter((current) =>
          current === 'collected' ? 'all' : current,
        )
        showToast(editing ? '菜谱改好啦' : '新菜谱收进图鉴啦')
      } else if (result.status === 'error') {
        setSheetError(result.message)
      }
    } finally {
      setPending(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) {
      return
    }
    setPending(true)
    setDeleteError(null)
    try {
      const result = await useAppStore
        .getState()
        .deleteCustomDish(deleteTarget.id)
      if (result.status === 'removed') {
        const archived = result.archived
        setDeleteTarget(null)
        setSelectedDishId(null)
        showToast(
          archived ? '已有记录，这道菜已归档' : '菜谱删掉啦',
        )
      } else if (result.status === 'error') {
        setDeleteError(result.message)
      }
    } finally {
      setPending(false)
    }
  }

  const emptyHint =
    filter === 'collected'
      ? '还没有收集到官方菜，去今日页抽一抽吧。'
      : '还没有自制菜谱，点右上角的 + 记一道。'

  return (
    <section className="page stamps-page" aria-labelledby="stamps-title">
      <header className="page-head stamp-book-head">
        <div className="stamp-book-head__copy">
          <p className="page-kicker">把吃过的快乐盖起来</p>
          <h1 id="stamps-title">图鉴</h1>
          <p className="page-subtitle">
            每一道认真吃过的菜，都会留下一枚小印章。
          </p>
        </div>
        <button
          type="button"
          className="stamp-add-button"
          aria-label="新增菜谱"
          title="新增菜谱"
          onClick={openCreate}
        >
          ＋
        </button>
      </header>

      <section className="stamp-summary" aria-label="官方菜谱收集进度">
        <div className="stamp-summary__ghost" aria-hidden="true">
          <span>{view.collected > 0 ? '🍥' : '＋'}</span>
        </div>
        <div className="stamp-summary__copy">
          <span>官方菜谱</span>
          <p>
            <strong>{view.collected}</strong>
            <small> / {view.total} 道</small>
          </p>
          <div
            className="stamp-progress"
            role="progressbar"
            aria-label="官方菜谱收集进度"
            aria-valuemin={0}
            aria-valuemax={view.total}
            aria-valuenow={view.collected}
            aria-valuetext={`已收集 ${view.collected} / ${view.total} 道官方菜的印章`}
          >
            <span style={{ width: `${view.percent}%` }} />
          </div>
        </div>
        <span className="stamp-summary__percent">{view.percent}%</span>
      </section>

      <section
        className="stamp-book"
        aria-labelledby="stamp-book-title"
      >
        <div className="section-head">
          <div>
            <h2 id="stamp-book-title">菜谱图鉴</h2>
            <p>官方进度和自制菜谱分开算。</p>
          </div>
          <span className="section-tag">
            {view.customTotal > 0
              ? `自制 ${view.customCollected}/${view.customTotal} 道`
              : '自制 0 道'}
          </span>
        </div>

        <div
          className="segmented stamp-filter"
          role="tablist"
          aria-label="图鉴筛选"
        >
          {FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={filter === item.key}
              className={filter === item.key ? 'is-active' : ''}
              onClick={() => setFilter(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {view.entries.length === 0 ? (
          <p className="stamp-book__hint">{emptyHint}</p>
        ) : (
          <ul className="stamp-book-grid">
            {view.entries.map((entry) => {
              const style =
                entry.collected && entry.tier
                  ? ({
                      '--stamp-color': STAMP_TIER_META[entry.tier].color,
                      '--stamp-soft': STAMP_TIER_META[entry.tier].soft,
                    } as CSSProperties)
                  : undefined

              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    className={`stamp-book-card${
                      entry.collected ? ' is-collected' : ' is-locked'
                    }${entry.archived ? ' is-archived' : ''}`}
                    style={style}
                    onClick={() => setSelectedDishId(entry.id)}
                    aria-label={stampBookCardLabel({
                      name: entry.name,
                      collected: entry.collected,
                      tierLabel: entry.tierLabel,
                      count: entry.count,
                    })}
                    aria-haspopup="dialog"
                  >
                    <DishStamp
                      dish={entry}
                      count={entry.count}
                      tier={entry.tier}
                      dateLabel={
                        entry.collected ? entry.dateLabel : undefined
                      }
                      size="md"
                      ariaHidden
                    />
                    {entry.isCustom && (
                      <span className="stamp-book-card__badge">
                        {entry.archived ? '已归档' : '自制'}
                      </span>
                    )}
                    <span className="stamp-book-card__name">
                      {entry.name}
                    </span>
                    <span className="stamp-book-card__meta">
                      {entry.archived
                        ? '已归档 · 历史仍可查看'
                        : entry.collected
                          ? `${entry.tierLabel}章 · ×${entry.count}`
                          : '未收集'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section
        className="legend-card"
        aria-labelledby="stamp-legend-title"
      >
        <h2 id="stamp-legend-title">印章会慢慢长大</h2>
        <p>同一道菜累计打卡次数越多，边框就会升一级。</p>
        <ul className="stamp-legend">
          {STAMP_TIERS.map((tier) => {
            const meta = STAMP_TIER_META[tier.tier]
            const style = {
              '--stamp-color': meta.color,
              '--stamp-soft': meta.soft,
            } as CSSProperties

            return (
              <li
                key={tier.tier}
                className="stamp-legend__item"
                style={style}
              >
                <span
                  className="stamp-legend__ring"
                  aria-hidden="true"
                />
                <span>
                  <strong>{tier.label}印</strong>
                  <small>{tier.minCount} 次起</small>
                </span>
              </li>
            )
          })}
        </ul>
      </section>

      {sheet && (
        <CustomDishSheet
          key={
            sheet.kind === 'edit' ? `edit-${sheet.dish.id}` : 'create'
          }
          dish={sheet.kind === 'edit' ? sheet.dish : null}
          ingredients={officialIngredients}
          customIngredients={data.customIngredients}
          pending={pending}
          error={sheetError}
          onClose={() => {
            if (!pending) {
              setSheet(null)
              setSheetError(null)
            }
          }}
          onSubmit={(input) => {
            void handleSubmit(input)
          }}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title={willArchive ? '归档这道菜？' : '删掉这道菜？'}
          description={
            willArchive
              ? '这道菜已经有记录。删除会改成归档：不再被抽到，图鉴和历史都会保留。'
              : '还没有任何记录，可以彻底删除。删除后不能恢复。'
          }
          confirmLabel={willArchive ? '归档' : '删除'}
          tone={willArchive ? 'default' : 'danger'}
          pending={pending}
          error={deleteError}
          onCancel={() => {
            if (!pending) {
              setDeleteTarget(null)
              setDeleteError(null)
            }
          }}
          onConfirm={() => {
            void handleDelete()
          }}
        />
      )}

      {selectedEntry && (
        <StampDetailModal
          entry={selectedEntry}
          showCalories={isCaloriesVisible(
            data.profile,
            data.settings.showCalories,
          )}
          onClose={() => setSelectedDishId(null)}
          {...(selectedCustom && !selectedCustom.archived
            ? {
                onEdit: () => {
                  setSelectedDishId(null)
                  openEdit(selectedCustom)
                },
                onDelete: () => {
                  setSelectedDishId(null)
                  setDeleteTarget(selectedCustom)
                },
              }
            : {})}
        />
      )}
    </section>
  )
}
