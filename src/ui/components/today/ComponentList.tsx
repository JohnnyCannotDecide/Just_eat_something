import type { TodayComponent } from '../../selectors/todayView'
import { ComponentRow } from './ComponentRow'

interface ComponentListProps {
  components: TodayComponent[]
  pending: boolean
  checkedIn: boolean
  showCalories: boolean
  undoableComponentId: string | null
  onToggleEaten: (component: TodayComponent, eaten: boolean) => void
  onRedraw: (component: TodayComponent) => void
  onDiscard: (component: TodayComponent) => void
  onUndo: (component: TodayComponent) => void
  onAddComponent?: () => void
}

export function ComponentList({
  components,
  pending,
  checkedIn,
  showCalories,
  undoableComponentId,
  onToggleEaten,
  onRedraw,
  onDiscard,
  onUndo,
  onAddComponent,
}: ComponentListProps) {
  return (
    <div className="component-list">
      <ul className="component-list__items" aria-label="套餐部件">
        {components.map((component) => (
          <ComponentRow
            key={component.id}
            component={component}
            disabled={pending}
            checkedIn={checkedIn}
            showCalories={showCalories}
            undoable={undoableComponentId === component.id}
            onToggleEaten={onToggleEaten}
            onRedraw={onRedraw}
            onDiscard={onDiscard}
            onUndo={onUndo}
          />
        ))}
      </ul>
      {!checkedIn && onAddComponent && (
        <button
          type="button"
          className="add-component-button"
          onClick={onAddComponent}
          disabled={pending}
        >
          ＋ 添加部件
        </button>
      )}
    </div>
  )
}
