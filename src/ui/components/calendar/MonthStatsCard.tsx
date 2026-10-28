import type { MonthStats } from '@/core/calendar'

interface MonthStatsCardProps {
  stats: MonthStats
}

export function MonthStatsCard({ stats }: MonthStatsCardProps) {
  return (
    <section className="calendar-stats" aria-label="本月统计">
      <dl className="calendar-stats__grid">
        <div className="calendar-stat">
          <dt>打卡天数</dt>
          <dd>
            {stats.checkedInDays}
            <small>天</small>
          </dd>
          <span className="calendar-stat__hint">至少一餐打卡</span>
        </div>
        <div className="calendar-stat">
          <dt>三餐全勤</dt>
          <dd>
            {stats.fullAttendanceDays}
            <small>天</small>
          </dd>
          <span className="calendar-stat__hint">三餐都打了卡</span>
        </div>
        <div className="calendar-stat">
          <dt>当前连续</dt>
          <dd>
            {stats.currentStreak}
            <small>天</small>
          </dd>
          <span className="calendar-stat__hint">从今天往前数</span>
        </div>
        <div className="calendar-stat">
          <dt>本月印章</dt>
          <dd>
            {stats.stampCount}
            <small>枚</small>
          </dd>
          <span className="calendar-stat__hint">按吃掉的菜计算</span>
        </div>
      </dl>
      <p className="calendar-stats__note">
        连续天数不受查看月份影响，断签后会从下一次打卡重新开始。
      </p>
    </section>
  )
}
