import type { Params } from '../../store/paramSchema'
import type { Drawable, ViewInfo } from '../types'
import { rgbaString } from '../colors'
import { mulberry32 } from '../rng'

/**
 * Kontur katmanı — pipeline'ın çıkardığı sınır noktalarını çizer.
 * `contourJitter` deterministik PRNG kullanır (kare + nokta indeksi tohum),
 * böylece aynı kare her zaman aynı görünür — export ve önizleme birebir aynı.
 */
export function drawContours(
  ctx: CanvasRenderingContext2D,
  items: Drawable[],
  p: Params,
  view: ViewInfo,
): void {
  if (p.contourMode === 'off' || items.length === 0) return
  ctx.save()
  ctx.setLineDash([])
  ctx.lineJoin = 'round'
  ctx.lineWidth = p.contourWidth

  for (const it of items) {
    const pts = it.track.contour
    if (!pts || pts.length < 3) continue
    const rand = mulberry32(view.frameIndex * 7919 + it.track.id * 104729)
    ctx.beginPath()
    for (let i = 0; i < pts.length; i++) {
      const jx = p.contourJitter > 0 ? (rand() - 0.5) * 2 * p.contourJitter : 0
      const jy = p.contourJitter > 0 ? (rand() - 0.5) * 2 * p.contourJitter : 0
      const x = pts[i]!.x * view.scaleX + jx
      const y = pts[i]!.y * view.scaleY + jy
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
    if (p.contourFill > 0) {
      ctx.fillStyle = rgbaString(it.color, p.contourFill * it.alpha)
      ctx.fill()
    }
    ctx.strokeStyle = rgbaString(it.color, p.contourOpacity * it.alpha)
    ctx.stroke()
  }
  ctx.restore()
}
