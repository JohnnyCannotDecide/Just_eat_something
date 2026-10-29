interface GuestHintCardProps {
  onDismiss: () => void
  onOpenProfile: () => void
}

export function GuestHintCard({
  onDismiss,
  onOpenProfile,
}: GuestHintCardProps) {
  return (
    <aside className="guest-hint" aria-label="个人档案提示">
      <div className="guest-hint__copy">
        <span className="guest-hint__emoji" aria-hidden="true">
          🌱
        </span>
        <div>
          <p className="guest-hint__title">想看看今天还剩多少？</p>
          <p className="guest-hint__text">
            填一份个人档案，就能看到每日目标和余量；不填也能继续记录。
          </p>
        </div>
      </div>
      <div className="guest-hint__actions">
        <button
          type="button"
          className="guest-hint__cta"
          onClick={onOpenProfile}
        >
          填写档案
        </button>
        <button
          type="button"
          className="guest-hint__close"
          onClick={onDismiss}
          aria-label="不再显示个人档案提示"
        >
          ×
        </button>
      </div>
    </aside>
  )
}
