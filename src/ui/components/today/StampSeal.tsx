import type { StampSlot, TodayStamp } from '../../selectors/todayView'
import { DishStamp } from '../stamp/DishStamp'

interface StampSealProps {
  stamp: TodayStamp | null
  slot: StampSlot
}

export function StampSeal({ stamp, slot }: StampSealProps) {
  if (stamp) {
    return (
      <DishStamp
        dish={stamp.dish}
        count={stamp.count}
        tier={stamp.tier}
        dateLabel={stamp.dateLabel}
        size="sm"
      />
    )
  }

  if (slot === 'custom') {
    return (
      <div className="stamp-slot stamp-slot--custom" aria-label="自定义记录，没有印章">
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
