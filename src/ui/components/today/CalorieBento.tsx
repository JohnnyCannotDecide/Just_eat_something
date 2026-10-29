import { STATUS_LABELS } from '../../copy'
import { formatKcal } from '../../formatKcal'
import type { TodayView } from '../../selectors/todayView'

interface CalorieBentoProps {
  view: TodayView
  onOpenProfile: () => void
}

export function CalorieBento({ view, onOpenProfile }: CalorieBentoProps) {
  const canShow = view.showCalories
  const hasProfile = view.hasProfile
  const hasTarget = view.targetCalories !== null
  const isOver = canShow && hasTarget && view.overCalories > 0
  const stampCount = view.meals.reduce(
    (sum, meal) => sum + meal.stamps.length,
    0,
  )
  const remainingLabel = !canShow
    ? '今日余量'
    : isOver
      ? '超出目标'
      : '还可吃'
  const targetText = !canShow ? '?' : formatKcal(view.targetCalories, canShow)
  const remainingValue = !canShow
    ? '?'
    : formatKcal(
        isOver ? view.overCalories : view.remainingCalories,
        canShow,
      )
  const progressText = !canShow ? '?' : `${view.progressPercent}%`
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
            {hasProfile ? (
              <small> / {targetText} kcal</small>
            ) : (
              <small> kcal</small>
            )}
          </p>

          {progressVisible && (
            <div
              className="bento-progress"
              role="progressbar"
              aria-label="今日热量进度"
              aria-valuemin={0}
              aria-valuemax={view.targetCalories ?? 0}
              aria-valuenow={Math.min(
                view.consumedCalories,
                view.targetCalories ?? 0,
              )}
              aria-valuetext={`${formatKcal(
                view.consumedCalories,
                canShow,
              )} / ${formatKcal(
                view.targetCalories,
                canShow,
              )} 千卡，已完成 ${view.progressPercent}%`}
            >
              <span
                className="bento-progress__fill"
                style={{ width: `${view.progressPercent}%` }}
              />
            </div>
          )}

          <div className="bento-cell__footline">
            {hasProfile && <span>{progressText}</span>}
            <span>
              {view.checkedInCount > 0
                ? `已记录 ${view.checkedInCount} 餐`
                : '等第一张小票'}
            </span>
          </div>
        </div>

        {hasProfile ? (
          <div className="bento-cell bento-cell--remaining">
            <span className="bento-cell__label">{remainingLabel}</span>
            <p className="bento-cell__side-number">
              {remainingValue}
              {canShow && <small>kcal</small>}
            </p>
            <span className="bento-cell__note">
              {!canShow
                ? '在设置里打开就能看到'
                : isOver
                  ? '不用责怪自己，明天继续'
                  : '留给下一餐吧'}
            </span>
          </div>
        ) : (
          <button
            type="button"
            className="bento-cell bento-cell--remaining bento-cell--profile-cta"
            onClick={onOpenProfile}
          >
            <span className="bento-cell__label">每日目标与余量</span>
            <span className="bento-cell__cta">填写档案查看余量</span>
            <span className="bento-cell__note">不填也能继续记录</span>
          </button>
        )}

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
