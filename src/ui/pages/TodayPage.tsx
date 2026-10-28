import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { buildDishLibrary } from '@/core/customDish'
import type { ComboCandidateSnapshot, MealType } from '@/core/types'
import { useAppStore } from '@/store/useAppStore'
import type {
  CheckInReceipt,
  DrawActionResult,
  DrawReceipt,
  RedrawActionResult,
} from '@/store/useAppStore'
import { useUiStore } from '@/store/useUiStore'

import { mockAdProvider } from '../ads/MockAdProvider'
import { AddComponentSheet } from '../components/gameplay/AddComponentSheet'
import { CheckInSheet } from '../components/gameplay/CheckInSheet'
import { CustomMealSheet } from '../components/gameplay/CustomMealSheet'
import { DrawOverlay } from '../components/gameplay/DrawOverlay'
import { RewardOverlay } from '../components/gameplay/RewardOverlay'
import { CalorieBento } from '../components/today/CalorieBento'
import { GuestHintCard } from '../components/today/GuestHintCard'
import { MealTimeline } from '../components/today/MealTimeline'
import type { TodayComponent } from '../selectors/todayView'
import { buildTodayView } from '../selectors/todayView'
import {
  DRAW_BLOCKED_MESSAGES,
  REDRAW_NO_CANDIDATE_MESSAGES,
} from '../copy'

type ActivePanel =
  | { kind: 'draw'; receipt: DrawReceipt }
  | { kind: 'checkIn'; meal: MealType }
  | { kind: 'custom'; meal: MealType }
  | { kind: 'addComponent'; meal: MealType; candidateId: string }
  | { kind: 'reward'; receipt: CheckInReceipt }

const COMPONENT_BLOCKED_MESSAGES: Record<string, string> = {
  'checked-in': '这餐已经收工啦',
  'no-selection': '先选一份套餐吧',
  'not-in-pool': '这份套餐已经不在候选里了',
  'component-missing': '这个部件找不到了',
  'not-redrawable': '自定义记录不能重抽',
  'no-draws': '这餐的次数用完啦',
  'last-component': '至少要保留一个部件',
  'restore-conflict': '套餐里已经有这道菜，无法撤销',
  'missing-dish': '这道菜暂时找不到了',
  'missing-discard': '没有可以撤销的舍弃',
}

export function TodayPage() {
  const data = useAppStore((state) => state.data)
  const todayKey = useAppStore((state) => state.todayKey)
  const lastDiscard = useAppStore((state) => state.lastDiscard)
  const dismissProfileHint = useAppStore(
    (state) => state.dismissProfileHint,
  )
  const view = useMemo(
    () => buildTodayView(data, todayKey, lastDiscard),
    [data, todayKey, lastDiscard],
  )
  const dishCatalog = useMemo(
    () => buildDishLibrary(data).dishes,
    [data],
  )

  const [panel, setPanel] = useState<ActivePanel | null>(null)
  const [sheetError, setSheetError] = useState<string | null>(null)

  const pendingRef = useRef<Set<MealType>>(new Set())
  const [pendingMeals, setPendingMeals] = useState<MealType[]>([])
  const showToast = useUiStore((state) => state.showToast)
  const openProfileEditor = useUiStore((state) => state.openProfileEditor)

  // 跨天/时钟回拨后，旧面板里的操作已经不属于今天，直接收起。
  useEffect(() => {
    setPanel(null)
    setSheetError(null)
  }, [todayKey])

  const beginMeal = useCallback((meal: MealType): boolean => {
    if (pendingRef.current.has(meal)) {
      return false
    }
    pendingRef.current.add(meal)
    setPendingMeals(Array.from(pendingRef.current))
    return true
  }, [])

  const endMeal = useCallback((meal: MealType) => {
    pendingRef.current.delete(meal)
    setPendingMeals(Array.from(pendingRef.current))
  }, [])

  const applyDrawResult = useCallback(
    (result: DrawActionResult) => {
      switch (result.status) {
        case 'drawn':
          setPanel({ kind: 'draw', receipt: result.receipt })
          break
        case 'blocked':
          showToast(DRAW_BLOCKED_MESSAGES[result.reason], 'error')
          break
        case 'stale':
          showToast(result.message, 'error')
          break
        case 'error':
          showToast(result.message, 'error')
          break
        case 'ad-cancelled':
          showToast('广告没看完，这次不算')
          break
        case 'ad-required':
          break
      }
    },
    [showToast],
  )

  const handleDraw = useCallback(
    async (meal: MealType) => {
      if (!beginMeal(meal)) {
        return
      }

      try {
        const result = await useAppStore.getState().drawMeal(meal)
        if (result.status !== 'ad-required') {
          applyDrawResult(result)
          return
        }

        const requestedDateKey = useAppStore.getState().todayKey
        const completed = await mockAdProvider.showRewardedAd()
        if (!completed) {
          showToast('广告没看完，这次不扣次数')
          return
        }

        const afterAd = await useAppStore
          .getState()
          .completeAdDraw(meal, true, requestedDateKey)
        applyDrawResult(afterAd)
      } finally {
        endMeal(meal)
      }
    },
    [applyDrawResult, beginMeal, endMeal, showToast],
  )

  const handleSelectCombo = useCallback(
    async (meal: MealType, candidateId: string) => {
      if (!beginMeal(meal)) {
        return
      }

      try {
        const result = await useAppStore
          .getState()
          .selectCombo(meal, candidateId)
        if (result.status === 'blocked') {
          showToast(
            result.reason === 'checked-in'
              ? '这餐已经收工啦'
              : '这份套餐不在这餐候选里',
            'error',
          )
        } else if (result.status === 'error') {
          showToast(result.message, 'error')
        }
      } finally {
        endMeal(meal)
      }
    },
    [beginMeal, endMeal, showToast],
  )

  const applyRedrawResult = useCallback(
    (result: RedrawActionResult) => {
      switch (result.status) {
        case 'redrawn':
          showToast(
            result.source ? '换好一个部件啦' : '免费换好一个部件啦',
          )
          break
        case 'no-candidate':
          showToast(REDRAW_NO_CANDIDATE_MESSAGES[result.reason], 'error')
          break
        case 'blocked':
          showToast(
            COMPONENT_BLOCKED_MESSAGES[result.reason] ?? '暂时不能重抽',
            'error',
          )
          break
        case 'stale':
        case 'error':
          showToast(result.message, 'error')
          break
        case 'ad-cancelled':
          showToast('广告没看完，这次不算')
          break
        case 'ad-required':
          break
      }
    },
    [showToast],
  )

  const handleRedraw = useCallback(
    async (meal: MealType, candidateId: string, componentId: string) => {
      if (!beginMeal(meal)) {
        return
      }

      try {
        const result = await useAppStore
          .getState()
          .redrawComponent(meal, candidateId, componentId)
        if (result.status !== 'ad-required') {
          applyRedrawResult(result)
          return
        }

        const requestedDateKey = useAppStore.getState().todayKey
        const completed = await mockAdProvider.showRewardedAd()
        if (!completed) {
          showToast('广告没看完，这次不扣次数')
          return
        }
        const afterAd = await useAppStore
          .getState()
          .completeAdRedraw(
            meal,
            candidateId,
            componentId,
            true,
            requestedDateKey,
          )
        applyRedrawResult(afterAd)
      } finally {
        endMeal(meal)
      }
    },
    [applyRedrawResult, beginMeal, endMeal, showToast],
  )

  const handleDiscard = useCallback(
    async (meal: MealType, candidateId: string, componentId: string) => {
      const result = await useAppStore
        .getState()
        .discardComponent(meal, candidateId, componentId)
      if (result.status === 'blocked') {
        showToast(
          COMPONENT_BLOCKED_MESSAGES[result.reason] ?? '暂时不能舍弃',
          'error',
        )
      } else if (result.status === 'error') {
        showToast(result.message, 'error')
      }
    },
    [showToast],
  )

  const handleUndo = useCallback(
    async (meal: MealType) => {
      const result = await useAppStore.getState().undoDiscard()
      if (result.status === 'blocked') {
        showToast(
          COMPONENT_BLOCKED_MESSAGES[result.reason] ?? '没有可以撤销的舍弃',
          'error',
        )
      } else if (result.status === 'error') {
        showToast(result.message, 'error')
      } else if (result.status === 'updated') {
        showToast(`${meal}的部件回来啦`)
      }
    },
    [showToast],
  )

  const handleToggleEaten = useCallback(
    async (
      meal: MealType,
      candidateId: string,
      component: TodayComponent,
      eaten: boolean,
    ) => {
      const result = await useAppStore
        .getState()
        .setComponentEaten(meal, candidateId, component.id, eaten)
      if (result.status === 'error') {
        showToast(result.message, 'error')
      } else if (result.status === 'blocked') {
        showToast(
          COMPONENT_BLOCKED_MESSAGES[result.reason] ?? '暂时不能修改',
          'error',
        )
      }
    },
    [showToast],
  )

  const closePanel = useCallback(() => {
    setPanel(null)
    setSheetError(null)
  }, [])

  const handleCheckIn = useCallback(
    async (
      meal: MealType,
      values: Parameters<
        ReturnType<typeof useAppStore.getState>['checkInMeal']
      >[1],
    ) => {
      if (!beginMeal(meal)) {
        return
      }

      setSheetError(null)
      try {
        const result = await useAppStore
          .getState()
          .checkInMeal(meal, values)

        if (result.status === 'checked-in') {
          setPanel({ kind: 'reward', receipt: result.receipt })
          return
        }

        if (result.status === 'blocked') {
          if (result.reason === 'checked-in') {
            setPanel(null)
            showToast('这餐已经收工啦', 'error')
          } else if (result.reason === 'no-selection') {
            setPanel(null)
            showToast('先选一份套餐吧', 'error')
          } else {
            setSheetError('至少勾选一个吃掉的部件。')
          }
          return
        }

        setSheetError(result.message)
      } finally {
        endMeal(meal)
      }
    },
    [beginMeal, endMeal, showToast],
  )

  const handleCustom = useCallback(
    async (
      meal: MealType,
      input: { name: string; calories: number | null },
    ) => {
      if (!beginMeal(meal)) {
        return
      }

      setSheetError(null)
      try {
        const result = await useAppStore
          .getState()
          .checkInCustomMeal(meal, input)

        if (result.status === 'checked-in') {
          setPanel({ kind: 'reward', receipt: result.receipt })
          return
        }

        if (result.status === 'blocked') {
          if (result.reason === 'checked-in') {
            setPanel(null)
            showToast('这餐已经收工啦', 'error')
          } else {
            setSheetError('这餐暂时记不了，稍后再试。')
          }
          return
        }

        setSheetError(result.message)
      } finally {
        endMeal(meal)
      }
    },
    [beginMeal, endMeal, showToast],
  )

  const handleAddComponent = useCallback(
    (meal: MealType, candidateId: string) => {
      setSheetError(null)
      setPanel({ kind: 'addComponent', meal, candidateId })
    },
    [],
  )

  const handleAddDish = useCallback(
    async (meal: MealType, candidateId: string, dishId: string) => {
      setSheetError(null)
      const result = await useAppStore
        .getState()
        .addComponent(meal, candidateId, dishId)
      if (result.status === 'updated') {
        closePanel()
        showToast('加进套餐啦')
      } else if (result.status === 'blocked') {
        setSheetError(
          COMPONENT_BLOCKED_MESSAGES[result.reason] ?? '暂时不能添加',
        )
      } else if (result.status === 'error') {
        setSheetError(result.message)
      }
    },
    [closePanel, showToast],
  )

  const handleAddCustom = useCallback(
    async (
      meal: MealType,
      candidateId: string,
      input: { name: string; calories: number | null },
    ) => {
      setSheetError(null)
      const result = await useAppStore
        .getState()
        .addCustomComponent(meal, candidateId, input)
      if (result.status === 'updated') {
        closePanel()
        showToast('自定义部件加进套餐啦')
      } else if (result.status === 'blocked') {
        setSheetError(
          COMPONENT_BLOCKED_MESSAGES[result.reason] ?? '暂时不能添加',
        )
      } else if (result.status === 'error') {
        setSheetError(result.message)
      }
    },
    [closePanel, showToast],
  )

  const persistComponent = useCallback(
    (
      meal: MealType,
      candidateId: string,
      componentId: string,
      update: {
        eaten: boolean
        grams: Record<string, number> | null
        calories: number | null | undefined
      },
    ) => {
      const store = useAppStore.getState()
      void store.setComponentEaten(
        meal,
        candidateId,
        componentId,
        update.eaten,
      )
      if (update.grams) {
        void store.updateComponentGrams(
          meal,
          candidateId,
          componentId,
          update.grams,
        )
      }
      if (update.calories !== undefined) {
        void store.updateComponentCalories(
          meal,
          candidateId,
          componentId,
          update.calories,
        )
      }
    },
    [],
  )

  const openCheckIn = useCallback((meal: MealType) => {
    setSheetError(null)
    setPanel({ kind: 'checkIn', meal })
  }, [])

  const openCustom = useCallback((meal: MealType) => {
    setSheetError(null)
    setPanel({ kind: 'custom', meal })
  }, [])

  const panelMeal =
    panel && panel.kind !== 'draw' && panel.kind !== 'reward'
      ? view.meals.find((meal) => meal.type === panel.meal)
      : undefined

  const panelRecord =
    panel && panel.kind !== 'draw' && panel.kind !== 'reward'
      ? data.days[todayKey]?.meals[panel.meal]
      : undefined

  const panelCandidate: ComboCandidateSnapshot | null =
    panelRecord?.selectedCandidateId
      ? (panelRecord.candidateCombos.find(
          (candidate) => candidate.id === panelRecord.selectedCandidateId,
        ) ?? null)
      : null

  const panelCandidateForAdd: ComboCandidateSnapshot | null =
    panel?.kind === 'addComponent'
      ? (panelRecord?.candidateCombos.find(
          (candidate) => candidate.id === panel.candidateId,
        ) ?? null)
      : null

  return (
    <section className="page today-page" aria-labelledby="today-title">
      <header className="today-head">
        <div className="today-head__copy">
          <p className="today-date">{view.dateLabel}</p>
          <h1 id="today-title">今天吃什么？</h1>
          <p className="today-subtitle">不用想太久，抽一份套餐就好。</p>
        </div>
        <div className="today-sticker" aria-hidden="true">
          <span className="today-sticker__emoji">🍱</span>
          <span className="today-sticker__label">便当手帐</span>
        </div>
      </header>

      {data.profile === null && !data.settings.profileHintDismissed && (
        <GuestHintCard
          onDismiss={() => {
            void dismissProfileHint().catch(() => {})
          }}
          onOpenProfile={() => openProfileEditor(0)}
        />
      )}

      <CalorieBento view={view} />

      <div className="section-head">
        <div>
          <h2>三餐小票</h2>
          <p>每一餐都留了一格，慢慢来。</p>
        </div>
        <span className="section-tag">
          {view.checkedInCount} / {view.meals.length} 已收工
        </span>
      </div>

      <MealTimeline
        meals={view.meals}
        pendingMeals={pendingMeals}
        showCalories={view.showCalories}
        onDraw={handleDraw}
        onSelectCombo={handleSelectCombo}
        onCheckIn={openCheckIn}
        onCustom={openCustom}
        onRedraw={handleRedraw}
        onAddComponent={handleAddComponent}
        onDiscard={handleDiscard}
        onUndo={handleUndo}
        onToggleEaten={handleToggleEaten}
      />

      {panel?.kind === 'draw' && (
        <DrawOverlay
          receipt={panel.receipt}
          showCalories={view.showCalories}
          onClose={closePanel}
        />
      )}

      {panel?.kind === 'checkIn' &&
        panelCandidate &&
        panelMeal?.type === panel.meal && (
          <CheckInSheet
            key={`${panel.meal}-${panelCandidate.id}`}
            mealLabel={panelMeal.label}
            candidate={panelCandidate}
            pending={pendingMeals.includes(panel.meal)}
            showCalories={view.showCalories}
            error={sheetError}
            onClose={closePanel}
            onSubmit={(values) => {
              void handleCheckIn(panel.meal, values)
            }}
            onPersist={(componentId, update) =>
              persistComponent(
                panel.meal,
                panelCandidate.id,
                componentId,
                update,
              )
            }
          />
        )}

      {panel?.kind === 'addComponent' &&
        panelMeal &&
        panelCandidateForAdd && (
          <AddComponentSheet
            key={`${panel.meal}-${panelCandidateForAdd.id}-add`}
            meal={panel.meal}
            mealLabel={panelMeal.label}
            comboRarity={panelCandidateForAdd.rarity}
            dishCatalog={dishCatalog}
            existingDishIds={panelCandidateForAdd.components
              .filter((component) => !component.discarded)
              .flatMap((component) => (component.dishId ? [component.dishId] : []))}
            showCalories={view.showCalories}
            pending={pendingMeals.includes(panel.meal)}
            error={sheetError}
            onClose={closePanel}
            onAddDish={(dishId) => {
              void handleAddDish(panel.meal, panel.candidateId, dishId)
            }}
            onAddCustom={(input) => {
              void handleAddCustom(panel.meal, panel.candidateId, input)
            }}
          />
        )}

      {panel?.kind === 'custom' && (
        <CustomMealSheet
          mealLabel={panelMeal?.label ?? '这一餐'}
          pending={pendingMeals.includes(panel.meal)}
          error={sheetError}
          onClose={closePanel}
          onSubmit={(input) => {
            void handleCustom(panel.meal, input)
          }}
        />
      )}

      {panel?.kind === 'reward' && (
        <RewardOverlay
          receipt={panel.receipt}
          showCalories={view.showCalories}
          onClose={closePanel}
        />
      )}
    </section>
  )
}
