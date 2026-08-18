import type { Params } from '../../store/paramSchema'
import type { Drawable, ViewInfo } from '../types'
import { rgbaString } from '../colors'

/**
 * İşaretçiler — crosshair, merkez noktası, dönen reticle, hız vektörü.
 * `crosshairExtend` 0'da küçük artı, 1'de kareyi baştan başa kesen çizgi.
 */
export function drawMarkers(
  ctx: CanvasRenderingContext2D,
  items: Drawable[],
  p: Params,
  view: ViewInfo,
): void {
  if (items.length === 0) return
  ctx.save()
  ctx.setLineDash([])
  for (const it of items) {
    const color = it.color
    const a = it.alpha

    if (p.crosshair) {
      const half = Math.max(it.rect.w, it.rect.h) * 0.5
      const maxLen = Math.max(view.width, view.height)
      const len = half * 0.6 + (maxLen - half * 0.6) * Math.pow(p.crosshairExtend, 1.5)
      ctx.strokeStyle = rgbaString(color, a)
      ctx.lineWidth = p.crosshairWidth
      ctx.beginPath()
      if (p.crosshairGap > 0) {
        ctx.moveTo(it.cx - len, it.cy)
        ctx.lineTo(it.cx - p.crosshairGap, it.cy)
        ctx.moveTo(it.cx + p.crosshairGap, it.cy)
        ctx.lineTo(it.cx + len, it.cy)
        ctx.moveTo(it.cx, it.cy - len)
        ctx.lineTo(it.cx, it.cy - p.crosshairGap)
        ctx.moveTo(it.cx, it.cy + p.crosshairGap)
        ctx.lineTo(it.cx, it.cy + len)
      } else {
        ctx.moveTo(it.cx - len, it.cy)
        ctx.lineTo(it.cx + len, it.cy)
        ctx.moveTo(it.cx, it.cy - len)
        ctx.lineTo(it.cx, it.cy + len)
      }
      ctx.stroke()
    }

    if (p.centroidDot > 0) {
      ctx.beginPath()
      ctx.arc(it.cx, it.cy, p.centroidDot, 0, Math.PI * 2)
      if (p.centroidHollow) {
        ctx.strokeStyle = rgbaString(color, a)
        ctx.lineWidth = Math.max(1, p.centroidDot * 0.35)
        ctx.stroke()
      } else {
        ctx.fillStyle = rgbaString(color, a)
        ctx.fill()
      }
    }

    if (p.reticle) {
      const rot = (view.frameIndex * p.reticleSpeed * Math.PI) / 60
      const rad = p.reticleRadius
      ctx.save()
      ctx.translate(it.cx, it.cy)
      ctx.rotate(rot)
      ctx.strokeStyle = rgbaString(color, a * 0.9)
      ctx.lineWidth = Math.max(1, p.boxStrokeWidth * 0.6)
      ctx.beginPath()
      ctx.arc(0, 0, rad, 0, Math.PI * 2)
      ctx.stroke()
      if (p.reticleTicks > 0) {
        ctx.beginPath()
        for (let i = 0; i < p.reticleTicks; i++) {
          const ang = (i / p.reticleTicks) * Math.PI * 2
          const long = i % 2 === 0
          const r0 = rad * (long ? 0.78 : 0.88)
          ctx.moveTo(Math.cos(ang) * r0, Math.sin(ang) * r0)
          ctx.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad)
        }
        ctx.stroke()
      }
      ctx.restore()
    }

    if (p.velocityVector) {
      const vx = it.vx * p.velocityScale
      const vy = it.vy * p.velocityScale
      const len = Math.hypot(vx, vy)
      if (len > 1) {
        const ex = it.cx + vx
        const ey = it.cy + vy
        const ang = Math.atan2(vy, vx)
        const head = Math.min(14, Math.max(5, len * 0.25))
        ctx.strokeStyle = rgbaString(color, a)
        ctx.lineWidth = Math.max(1, p.boxStrokeWidth * 0.8)
        ctx.beginPath()
        ctx.moveTo(it.cx, it.cy)
        ctx.lineTo(ex, ey)
        ctx.moveTo(ex, ey)
        ctx.lineTo(ex - head * Math.cos(ang - 0.4), ey - head * Math.sin(ang - 0.4))
        ctx.moveTo(ex, ey)
        ctx.lineTo(ex - head * Math.cos(ang + 0.4), ey - head * Math.sin(ang + 0.4))
        ctx.stroke()
      }
    }
  }
  ctx.restore()
}
