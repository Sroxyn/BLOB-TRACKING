import type { Params } from '../../store/paramSchema'
import type { Drawable, ViewInfo } from '../types'
import { rgbaString } from '../colors'

/**
 * Etiket katmanı — şablon tabanlı.
 * Desteklenen token'lar:
 *   {id} {x} {y} {w} {h} {area} {vx} {vy} {speed} {age} {conf} {index}
 * Konum: top-left · top-right · bottom · center · follow-corner · outside-leader
 */

const FONTS: Record<string, string> = {
  mono: '"JetBrains Mono", "SFMono-Regular", Menlo, Consolas, "Courier New", monospace',
  sans: 'Inter, "Helvetica Neue", Arial, sans-serif',
  condensed: '"Arial Narrow", "Roboto Condensed", Impact, sans-serif',
}

export function drawLabels(
  ctx: CanvasRenderingContext2D,
  items: Drawable[],
  p: Params,
  view: ViewInfo,
): void {
  if (!p.labelEnabled || items.length === 0) return
  ctx.save()
  ctx.setLineDash([])
  ctx.font = `${p.labelSize}px ${FONTS[p.labelFont] ?? FONTS.mono}`
  ctx.textBaseline = 'alphabetic'
  const spacing = ctx as CanvasRenderingContext2D & { letterSpacing?: string }
  const supportsSpacing = 'letterSpacing' in ctx
  if (supportsSpacing) spacing.letterSpacing = `${p.labelTracking}px`

  const lineHeight = p.labelSize * 1.25

  for (const it of items) {
    // Satır bölme BÜYÜK HARFTEN ÖNCE olmalı: aksi hâlde "\n" → "\N" olup token bozulur.
    const text = formatTemplate(p.labelTemplate, it, p, view)
    const lines = text
      .split(/\\n|\n/)
      .map((l) => (p.labelUppercase ? l.toUpperCase() : l))
    const widths = lines.map((l) => measure(ctx, l, p, supportsSpacing))
    const boxW = Math.max(...widths)
    const boxH = lines.length * lineHeight

    const { x, y, align, leader } = anchor(it, p, view, boxW, boxH, lineHeight)

    if (p.labelBackground > 0) {
      ctx.fillStyle = `rgba(0,0,0,${p.labelBackground * it.alpha})`
      const pad = p.labelPadding
      const bx = align === 'right' ? x - boxW : align === 'center' ? x - boxW / 2 : x
      const by = y - p.labelSize * 0.82
      ctx.fillRect(bx - pad, by - pad, boxW + pad * 2, boxH + pad * 2)
      if (p.labelBorder) {
        ctx.strokeStyle = rgbaString(it.color, 0.6 * it.alpha)
        ctx.lineWidth = 1
        ctx.strokeRect(bx - pad, by - pad, boxW + pad * 2, boxH + pad * 2)
      }
    }

    if (leader) {
      ctx.strokeStyle = rgbaString(it.color, 0.5 * it.alpha)
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(leader.x0, leader.y0)
      ctx.lineTo(leader.x1, leader.y1)
      ctx.stroke()
    }

    ctx.fillStyle = rgbaString(it.color, p.labelOpacity * it.alpha)
    ctx.textAlign = align
    lines.forEach((line, i) => {
      ctx.fillText(line, x, y + i * lineHeight)
    })
  }
  if (supportsSpacing) spacing.letterSpacing = '0px'
  ctx.restore()
}

function measure(
  ctx: CanvasRenderingContext2D,
  text: string,
  p: Params,
  supportsSpacing: boolean,
): number {
  const w = ctx.measureText(text).width
  return supportsSpacing ? w : w + Math.max(0, text.length - 1) * p.labelTracking
}

function anchor(
  it: Drawable,
  p: Params,
  view: ViewInfo,
  boxW: number,
  boxH: number,
  lineHeight: number,
): { x: number; y: number; align: CanvasTextAlign; leader?: { x0: number; y0: number; x1: number; y1: number } } {
  const r = it.rect
  const gap = Math.max(4, p.labelSize * 0.35)
  const roomRight = view.width - (r.x + r.w) > boxW + gap * 4
  switch (p.labelPosition) {
    case 'top-right':
      return { x: r.x + r.w, y: r.y - gap, align: 'right' }
    case 'bottom':
      return { x: r.x, y: r.y + r.h + gap + p.labelSize, align: 'left' }
    case 'center':
      return { x: it.cx, y: it.cy + p.labelSize * 0.35 - (boxH - lineHeight) / 2, align: 'center' }
    case 'follow-corner':
      // kadrajda yer olan tarafa yaslanır → etiket taşmaz
      return roomRight
        ? { x: r.x + r.w + gap, y: r.y + p.labelSize, align: 'left' }
        : { x: r.x - gap, y: r.y + p.labelSize, align: 'right' }
    case 'outside-leader': {
      const lx = roomRight ? r.x + r.w + gap * 3 : r.x - gap * 3
      const ly = Math.max(p.labelSize, r.y - gap * 2)
      return {
        x: lx,
        y: ly,
        align: roomRight ? 'left' : 'right',
        leader: {
          x0: roomRight ? r.x + r.w : r.x,
          y0: r.y,
          x1: roomRight ? lx - gap * 0.8 : lx + gap * 0.8,
          y1: ly + p.labelSize * 0.2,
        },
      }
    }
    default:
      return { x: r.x, y: r.y - gap, align: 'left' }
  }
}

export function formatTemplate(template: string, it: Drawable, p: Params, view: ViewInfo): string {
  const t = it.track
  const d = p.labelDecimals
  const [cx, cy] = toCoordSpace(it.cx, it.cy, p, view)
  const [bw, bh] = p.coordSpace === 'pixel' ? [it.rect.w, it.rect.h] : [it.rect.w / view.width, it.rect.h / view.height]
  const speed = Math.hypot(it.vx, it.vy)
  const areaPx = t.area * view.scaleX * view.scaleY
  const map: Record<string, string> = {
    id: t.label,
    x: cx.toFixed(d),
    y: cy.toFixed(d),
    w: bw.toFixed(d),
    h: bh.toFixed(d),
    area: Math.round(areaPx).toString(),
    vx: it.vx.toFixed(Math.max(1, d)),
    vy: it.vy.toFixed(Math.max(1, d)),
    speed: speed.toFixed(Math.max(1, d)),
    age: t.totalFrames.toString(),
    conf: t.confidence.toFixed(2),
    index: String(it.index + 1),
  }
  return template.replace(/\{(\w+)\}/g, (m, key: string) => map[key] ?? m)
}

function toCoordSpace(x: number, y: number, p: Params, view: ViewInfo): [number, number] {
  switch (p.coordSpace) {
    case 'normalized':
      return [x / view.width, y / view.height]
    case 'centered':
      return [(x / view.width) * 2 - 1, (y / view.height) * 2 - 1]
    default:
      return [x, y]
  }
}
