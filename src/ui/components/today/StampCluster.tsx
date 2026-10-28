import { STAMP_DISPLAY } from '@/config/gameConfig'

import type { StampSlot, TodayStamp } from '../../selectors/todayView'
import { DishStamp } from '../stamp/DishStamp'

interface StampClusterProps {
  stamps: TodayStamp[]
  slot: StampSlot
}

export function StampCluster({ stamps, slot }: StampClusterProps) {
  if (stamps.length === 0) {
    if (slot === 'custom') {
      return (
        <div
          className="stamp-slot stamp-slot--custom"
          aria-label="自定义记录，没有印章"
        >
          <span className="stamp-slot__plus" aria-hidden="true">
            🍽️
          </span>
          <span className="stamp-slot__label">无印章</span>
        </div>
      )
    }

    return (
      <div className="stamp-slot" aria-label="预留印章位，打卡后盖上">
        <span className="stamp-slot__plus" aria-hidden="true">
          ＋
        </span>
        <span className="stamp-slot__label">印章位</span>
      </div>
    )
  }

  const visible = stamps.slice(0, STAMP_DISPLAY.maxInline)
  const hidden = stamps.length - visible.length

  return (
    <div
      className="stamp-cluster"
      aria-label={`本餐获得 ${stamps.length} 枚印章`}
    >
      {visible.map((stamp) => (
        <DishStamp
          key={stamp.dish.id}
          dish={stamp.dish}
          count={stamp.count}
          tier={stamp.tier}
          dateLabel={stamp.dateLabel}
          size="sm"
        />
      ))}
      {hidden > 0 && (
        <span className="stamp-cluster__more" aria-label={`还有 ${hidden} 枚`}>
          +{hidden}
        </span>
      )}
    </div>
  )
}
