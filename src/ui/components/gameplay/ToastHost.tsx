import { useUiStore } from '@/store/useUiStore'

import { Toast } from './Toast'

/** 全局轻提示。放在应用外壳之外，清空数据回到引导页时也能显示。 */
export function ToastHost() {
  const toast = useUiStore((state) => state.toast)
  const dismissToast = useUiStore((state) => state.dismissToast)

  return <Toast toast={toast} onDismiss={dismissToast} />
}
