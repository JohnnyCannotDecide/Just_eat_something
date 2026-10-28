import { STATUS_LABELS } from '../../copy'
import { formatKcal } from '../../formatKcal'
import type { TodayView } from '../../selectors/todayView'

interface CalorieBentoProps {
  view: TodayView
}

export function CalorieBento({ view }: CalorieBentoProps) {
  const canShow = view.showCalories
  const hasTarget = view.targetCalories !== null
  const isOver = canShow && view.overCalories > 0
  const stampCount = view.meals.reduce(
    (sum, meal) => sum + meal.stamps.length,
    0,
  )
  const remainingLabel = !canShow
    ? '今日余量'
    : isOver
      ? '超出目标'
      : '还可吃'
  const targetText = !canShow
    ? '?'
    : hasTarget
      ? formatKcal(view.targetCalories, canShow)
      : '待设置'
  const remainingValue = !canShow
    ? '?'
    : hasTarget
      ? formatKcal(
          isOver ? view.overCalories : view.remainingCalories,
          canShow,
        )
      : '待设置'
  const progressText = !canShow
    ? '?'
    : hasTarget
      ? `${view.progressPercent}%`
      : '目标待设置'
  const progressVisible = canShow && hasTarget

  return (
    <section className="bento" aria-label="今日概览">
      <span className="bento__tape" aria-hidden="true" />
      <header className="bento__overview">
        <h2 className="bento__title">今日概览</h2>
        <span className="bento__stamp-badge">
          <span aria-hidden="true">🏵</span>
          今日印章 {stampCount} 枚
        </span>
      </header>

      <ul className="bento-meal-list">
        {view.meals.map((meal) => (
          <li
            key={meal.type}
            className={`meal-status meal-status--${meal.status}`}
          >
            <i className="meal-status__dot" aria-hidden="true" />
            <span aria-hidden="true">{meal.emoji}</span>
            {meal.label}·{STATUS_LABELS[meal.status]}
          </li>
        ))}
      </ul>

      <div className="bento__grid">
        <div className="bento-cell bento-cell--main">
          <div className="bento-cell__topline">
            <span>今日已摄入</span>
            <span className="bento-cell__stamp" aria-hidden="true">
              便当
            </span>
          </div>

          <p className="bento-cell__number">
            {formatKcal(view.consumedCalories, canShow)}
            <small> / {targetText} kcal</small>
          </p>

          <div
            className="bento-progress"
            role={progressVisible ? 'progressbar' : undefined}
            aria-label={
              !canShow
                ? '热量已隐藏'
                : hasTarget
                  ? '今日热量进度'
                  : '还没有设置热量目标'
            }
            aria-valuemin={progressVisible ? 0 : undefined}
            aria-valuemax={
              progressVisible ? (view.targetCalories ?? 0) : undefined
            }
            aria-valuenow={
              progressVisible
                ? Math.min(view.consumedCalories, view.targetCalories ?? 0)
                : undefined
            }
            aria-valuetext={
              progressVisible
                ? `${formatKcal(view.consumedCalories, canShow)} / ${formatKcal(
                    view.targetCalories,
                    canShow,
                  )} 千卡，已完成 ${view.progressPercent}%`
                : undefined
            }
          >
            <span
              className={`bento-progress__fill${
                isOver ? ' is-over' : ''
              }`}
              style={{ width: `${progressVisible ? view.progressPercent : 0}%` }}
            />
          </div>

          <div className="bento-cell__footline">
            <span>{progressText}</span>
            <span>
              {view.checkedInCount > 0
                ? `已记录 ${view.checkedInCount} 餐`
                : '等第一张小票'}
            </span>
          </div>
        </div>

        <div className={`bento-cell bento-cell--remaining${isOver ? ' is-over' : ''}`}>
          <span className="bento-cell__label">{remainingLabel}</span>
          <p className="bento-cell__side-number">
            {remainingValue}
            {canShow && hasTarget && <small>kcal</small>}
          </p>
          <span className="bento-cell__note">
            {!canShow
              ? '在设置里打开就能看到'
              : !hasTarget
                ? '完成设置后出现'
                : isOver
                  ? '不用责怪自己'
                  : '留给下一餐吧'}
          </span>
        </div>

        <div className="bento-cell bento-cell--tokens">
          <div className="bento-cell__token-head">
            <span className="ticket-mark" aria-hidden="true">
              🎟️
            </span>
            <span className="bento-cell__label">抽卡券</span>
          </div>
          <p className="bento-cell__side-number">
            {view.tokenCount}
            <small>张</small>
          </p>
          <span className="bento-cell__note">仅今天有效</span>
        </div>
      </div>
      <p className="bento__caption">
        <span aria-hidden="true">✎</span> 今天慢慢吃，够了就好。
      </p>
    </section>
  )
}
