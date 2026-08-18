import type { Rect, Track } from '../cv/types'
import type { Params } from '../store/paramSchema'

export interface ViewInfo {
  width: number
  height: number
  time: number
  frameIndex: number
  fps: number
  /** Detection uzayından çizim uzayına ölçek. */
  scaleX: number
  scaleY: number
  overlayOnly: boolean
}

/**
 * Drawable — bir track'in ÇİZİM uzayındaki hazırlanmış hâli.
 * Kutu ölçekleme, padding, kare zorlama, nefes animasyonu, renk ve
 * doğum/kaybolma opaklığı tek yerde hesaplanır; katmanlar yeniden hesaplamaz.
 */
export interface Drawable {
  track: Track
  rect: Rect
  cx: number
  cy: number
  color: string
  alpha: number
  /** Çizim uzayında hız vektörü (px/kare). */
  vx: number
  vy: number
  index: number
}

export type Layer = (
  ctx: CanvasRenderingContext2D,
  items: Drawable[],
  p: Params,
  view: ViewInfo,
) => void
