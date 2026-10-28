/**
 * 广告端口。MockAdProvider（5 秒倒计时弹窗）或真实广告 SDK
 * 在 UI / 基础设施层实现，业务逻辑只依赖这个接口。
 */
export interface AdProvider {
  /** 完整看完激励广告返回 true；中途关闭返回 false。 */
  showRewardedAd(): Promise<boolean>
}
