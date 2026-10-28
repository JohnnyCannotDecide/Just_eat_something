import type { MealType } from '@/core/types'

import type {
  TodayComponent,
  TodayMealView,
} from '../../selectors/todayView'
import { MealNode } from './MealNode'

interface MealTimelineProps {
  meals: TodayMealView[]
  pendingMeals: readonly MealType[]
  showCalories: boolean
  onDraw: (meal: MealType) => void
  onSelectCombo: (meal: MealType, candidateId: string) => void
  onCheckIn: (meal: MealType) => void
  onCustom: (meal: MealType) => void
  onRedraw: (meal: MealType, candidateId: string, componentId: string) => void
  onAddComponent: (meal: MealType, candidateId: string) => void
  onDiscard: (meal: MealType, candidateId: string, componentId: string) => void
  onUndo: (meal: MealType) => void
  onToggleEaten: (
    meal: MealType,
    candidateId: string,
    component: TodayComponent,
    eaten: boolean,
  ) => void
}

export function MealTimeline({
  meals,
  pendingMeals,
  showCalories,
  onDraw,
  onSelectCombo,
  onCheckIn,
  onCustom,
  onRedraw,
  onAddComponent,
  onDiscard,
  onUndo,
  onToggleEaten,
}: MealTimelineProps) {
  return (
    <ol className="meal-timeline" aria-label="今天的三餐">
      {meals.map((meal, index) => (
        <MealNode
          key={meal.type}
          meal={meal}
          index={index}
          pending={pendingMeals.includes(meal.type)}
          showCalories={showCalories}
          onDraw={onDraw}
          onSelectCombo={onSelectCombo}
          onCheckIn={onCheckIn}
          onCustom={onCustom}
          onRedraw={onRedraw}
          onAddComponent={onAddComponent}
          onDiscard={onDiscard}
          onUndo={onUndo}
          onToggleEaten={onToggleEaten}
        />
      ))}
    </ol>
  )
}
