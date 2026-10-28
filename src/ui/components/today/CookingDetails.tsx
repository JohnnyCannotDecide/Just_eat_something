import type { CookingInfo } from '@/core/types'

interface CookingDetailsProps {
  cooking: CookingInfo
  open: boolean
}

export function CookingDetails({ cooking, open }: CookingDetailsProps) {
  if (!open) {
    return null
  }

  return (
    <div className="cooking-details">
      <p className="cooking-details__meta">
        {cooking.method} · 约 {cooking.timeMinutes} 分钟
      </p>
      <ol className="cooking-details__steps">
        {cooking.steps.map((step, index) => (
          <li key={`${index}-${step}`}>{step}</li>
        ))}
      </ol>
      {cooking.tips && (
        <p className="cooking-details__tips">小提示：{cooking.tips}</p>
      )}
    </div>
  )
}
