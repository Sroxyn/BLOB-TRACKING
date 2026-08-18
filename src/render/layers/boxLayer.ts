import type { Params } from '../../store/paramSchema'
import type { Drawable, ViewInfo } from '../types'
import { rgbaString } from '../colors'

/**
 * Kutu katmanı — full / corners / circle / ellipse / capsule / diamond.
 * Dash, marching-ants ofseti ve glow burada uygulanır.
 */
export function drawBoxes(
  ctx: CanvasRenderingContext2D,
  items: Drawable[],
  p: Params,
  view: ViewInfo,
): void {
  if (p.boxStyle === 'none' || items.length === 0) return
  ctx.save()
  ctx.lineJoin = 'miter'
  ctx.lineCap = 'butt'
  for (const it of items) {
    const { rect: r } = it
    ctx.lineWidth = p.boxStrokeWidth
    applyDash(ctx, p, view)
    if (p.boxGlow > 0) {
      ctx.shadowBlur = p.boxGlow
      ctx.shadowColor = it.color
    } else {
      ctx.shadowBlur = 0
    }

    ctx.beginPath()
    switch (p.boxStyle) {
      case 'full':
        if (p.boxRoundness > 0) roundRect(ctx, r.x, r.y, r.w, r.h, p.boxRoundness)
        else ctx.rect(r.x, r.y, r.w, r.h)
        break
      case 'circle': {
        const rad = Math.max(r.w, r.h) / 2
        ctx.arc(it.cx, it.cy, rad, 0, Math.PI * 2)
        break
      }
      case 'ellipse':
        ctx.ellipse(it.cx, it.cy, r.w / 2, r.h / 2, 0, 0, Math.PI * 2)
        break
      case 'capsule':
        roundRect(ctx, r.x, r.y, r.w, r.h, Math.min(r.w, r.h) / 2)
        break
      case 'diamond':
        ctx.moveTo(it.cx, r.y)
        ctx.lineTo(r.x + r.w, it.cy)
        ctx.lineTo(it.cx, r.y + r.h)
        ctx.lineTo(r.x, it.cy)
        ctx.closePath()
        break
      case 'corners':
        cornerBrackets(ctx, r.x, r.y, r.w, r.h, p.cornerLength)
        break
      default:
        break
    }

    if (p.boxFill > 0 && p.boxStyle !== 'corners') {
      ctx.fillStyle = rgbaString(it.color, p.boxFill * it.alpha)
      ctx.fill()
    }
    if (p.boxOpacity > 0) {
      ctx.strokeStyle = rgbaString(it.color, p.boxOpacity * it.alpha)
      ctx.stroke()
    }
  }
  ctx.restore()
}

function cornerBrackets(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  lengthRatio: number,
): void {
  const len = Math.max(2, Math.min(w, h) * lengthRatio)
  // sol üst
  ctx.moveTo(x, y + len)
  ctx.lineTo(x, y)
  ctx.lineTo(x + len, y)
  // sağ üst
  ctx.moveTo(x + w - len, y)
  ctx.lineTo(x + w, y)
  ctx.lineTo(x + w, y + len)
  // sağ alt
  ctx.moveTo(x + w, y + h - len)
  ctx.lineTo(x + w, y + h)
  ctx.lineTo(x + w - len, y + h)
  // sol alt
  ctx.moveTo(x + len, y + h)
  ctx.lineTo(x, y + h)
  ctx.lineTo(x, y + h - len)
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rad = Math.min(r, w / 2, h / 2)
  ctx.moveTo(x + rad, y)
  ctx.arcTo(x + w, y, x + w, y + h, rad)
  ctx.arcTo(x + w, y + h, x, y + h, rad)
  ctx.arcTo(x, y + h, x, y, rad)
  ctx.arcTo(x, y, x + w, y, rad)
  ctx.closePath()
}

/** Dash deseni çizgi kalınlığına göre ölçeklenir; ofset kare numarasına bağlıdır. */
export function applyDash(ctx: CanvasRenderingContext2D, p: Params, view: ViewInfo): void {
  const u = p.boxStrokeWidth * p.boxDashScale
  switch (p.boxDash) {
    case 'dashed':
      ctx.setLineDash([u * 4, u * 3])
      break
    case 'dotted':
      ctx.setLineDash([0.01, u * 2.5])
      ctx.lineCap = 'round'
      break
    case 'dash-dot':
      ctx.setLineDash([u * 5, u * 2, 0.01, u * 2])
      ctx.lineCap = 'round'
      break
    default:
      ctx.setLineDash([])
      return
  }
  ctx.lineDashOffset = -view.frameIndex * p.boxDashSpeed
}
