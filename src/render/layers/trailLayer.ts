import type { Params } from '../../store/paramSchema'
import type { Drawable, ViewInfo } from '../types'
import { PALETTES, hslHex, rgbaString } from '../colors'

/**
 * İz katmanı — track'in geçmiş merkez noktaları.
 * Stiller: line · dots · ribbon (hıza göre kalınlaşan) · fade (segment başına
 * azalan opaklık). Renk: track rengi · tek renk · zaman içinde gradyan.
 */
export function drawTrails(
  ctx: CanvasRenderingContext2D,
  items: Drawable[],
  p: Params,
  view: ViewInfo,
): void {
  if (p.trailLength <= 0 || items.length === 0) return
  ctx.save()
  ctx.setLineDash([])
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  for (const it of items) {
    const raw = it.track.trail
    if (raw.length < 2) continue
    const pts = raw.map((pt) => ({ x: pt.x * view.scaleX, y: pt.y * view.scaleY }))
    const count = pts.length

    const colorAt = (i: number): string => {
      const t = i / Math.max(1, count - 1)
      if (p.trailColorMode === 'single') return p.accentColor
      if (p.trailColorMode === 'gradient') {
        const palette = PALETTES[p.palette] ?? PALETTES['terminal-green']!
        return p.colorMode === 'single' ? hslHex(200 + t * 140, 0.8, 0.55) : palette[Math.floor(t * (palette.length - 1))]!
      }
      return it.color
    }

    if (p.trailStyle === 'dots') {
      for (let i = 0; i < count; i++) {
        const t = i / Math.max(1, count - 1)
        const a = p.trailOpacity * it.alpha * (1 - p.trailTaper * (1 - t))
        ctx.fillStyle = rgbaString(colorAt(i), a)
        const r = Math.max(0.4, p.trailWidth * (1 - p.trailTaper * (1 - t)))
        ctx.beginPath()
        ctx.arc(pts[i]!.x, pts[i]!.y, r, 0, Math.PI * 2)
        ctx.fill()
      }
      continue
    }

    if (p.trailStyle === 'line') {
      ctx.strokeStyle = rgbaString(colorAt(count - 1), p.trailOpacity * it.alpha)
      ctx.lineWidth = p.trailWidth
      ctx.beginPath()
      ctx.moveTo(pts[0]!.x, pts[0]!.y)
      for (let i = 1; i < count; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y)
      ctx.stroke()
      continue
    }

    // fade / ribbon → segment segment
    for (let i = 1; i < count; i++) {
      const t = i / Math.max(1, count - 1)
      const a = p.trailOpacity * it.alpha * (p.trailStyle === 'fade' ? Math.pow(t, 1 + p.trailTaper * 2) : 1)
      if (a <= 0.004) continue
      let width = p.trailWidth
      if (p.trailStyle === 'ribbon') {
        const seg = Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y)
        width = Math.max(0.5, p.trailWidth * (0.4 + Math.min(3, seg / 6)))
      }
      width *= 1 - p.trailTaper * (1 - t)
      ctx.strokeStyle = rgbaString(colorAt(i), a)
      ctx.lineWidth = Math.max(0.3, width)
      ctx.beginPath()
      ctx.moveTo(pts[i - 1]!.x, pts[i - 1]!.y)
      ctx.lineTo(pts[i]!.x, pts[i]!.y)
      ctx.stroke()
    }
  }
  ctx.restore()
}
