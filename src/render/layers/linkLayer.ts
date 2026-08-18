import type { Params } from '../../store/paramSchema'
import type { Drawable, ViewInfo } from '../types'
import { rgbaString } from '../colors'

/**
 * Bağlantı çizgileri.
 * Modlar: nearest-n · all · chain (ID sırası) · delaunay · to-center · to-largest
 * Stiller: straight · arc · bezier · orthogonal (devre kartı) · spline
 *
 * Delaunay, ≤32 nokta olduğu için kaba kuvvet çevrel çember testiyle bulunur
 * (üçlü başına diğer noktalar çember içinde mi) — O(n⁴) ama n küçük.
 */
export function drawLinks(
  ctx: CanvasRenderingContext2D,
  items: Drawable[],
  p: Params,
  view: ViewInfo,
): void {
  if (p.linkMode === 'off' || items.length < 1) return
  const diag = Math.hypot(view.width, view.height)
  const maxDist = (p.linkMaxDistance / 100) * diag
  const pairs = buildPairs(items, p, view)
  if (pairs.length === 0) return

  ctx.save()
  ctx.lineWidth = p.linkWidth
  ctx.lineCap = 'round'
  switch (p.linkDash) {
    case 'dashed':
      ctx.setLineDash([p.linkWidth * 5, p.linkWidth * 4])
      break
    case 'dotted':
      ctx.setLineDash([0.01, p.linkWidth * 3])
      break
    default:
      ctx.setLineDash([])
  }

  ctx.font = `${Math.max(8, p.labelSize * 0.75)}px "JetBrains Mono", monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  for (const [a, b] of pairs) {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const dist = Math.hypot(dx, dy)
    if (dist > maxDist) continue
    const fade = p.linkFadeByDistance ? 1 - dist / maxDist : 1
    const alpha = p.linkOpacity * fade * Math.min(a.alpha, b.alpha)
    if (alpha <= 0.003) continue
    ctx.strokeStyle = rgbaString(a.color, alpha)

    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    switch (p.linkStyle) {
      case 'arc': {
        const mx = (a.x + b.x) / 2
        const my = (a.y + b.y) / 2
        const nx = -dy / (dist || 1)
        const ny = dx / (dist || 1)
        const bow = dist * 0.25
        ctx.quadraticCurveTo(mx + nx * bow, my + ny * bow, b.x, b.y)
        break
      }
      case 'bezier':
        ctx.bezierCurveTo(a.x + dx * 0.35, a.y, b.x - dx * 0.35, b.y, b.x, b.y)
        break
      case 'orthogonal': {
        const midX = a.x + dx * 0.5
        ctx.lineTo(midX, a.y)
        ctx.lineTo(midX, b.y)
        ctx.lineTo(b.x, b.y)
        break
      }
      case 'spline': {
        const mx = (a.x + b.x) / 2
        const my = (a.y + b.y) / 2
        ctx.quadraticCurveTo(a.x + dx * 0.25, my, mx, my)
        ctx.quadraticCurveTo(b.x - dx * 0.25, my, b.x, b.y)
        break
      }
      default:
        ctx.lineTo(b.x, b.y)
    }
    ctx.stroke()

    if (p.linkMidpointDot > 0) {
      ctx.fillStyle = rgbaString(a.color, alpha)
      ctx.beginPath()
      ctx.arc((a.x + b.x) / 2, (a.y + b.y) / 2, p.linkMidpointDot, 0, Math.PI * 2)
      ctx.fill()
    }
    if (p.linkLabel) {
      ctx.fillStyle = rgbaString(a.color, Math.min(1, alpha * 1.6))
      ctx.fillText(Math.round(dist).toString(), (a.x + b.x) / 2, (a.y + b.y) / 2 - p.labelSize * 0.7)
    }
  }
  ctx.restore()
}

interface Node {
  x: number
  y: number
  color: string
  alpha: number
}

function buildPairs(items: Drawable[], p: Params, view: ViewInfo): [Node, Node][] {
  const nodes: Node[] = items.map((it) => ({ x: it.cx, y: it.cy, color: it.color, alpha: it.alpha }))
  const out: [Node, Node][] = []
  const n = nodes.length

  switch (p.linkMode) {
    case 'all':
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) out.push([nodes[i]!, nodes[j]!])
      break
    case 'chain': {
      const order = items
        .map((it, i) => ({ id: it.track.id, i }))
        .sort((a, b) => a.id - b.id)
        .map((o) => nodes[o.i]!)
      for (let i = 0; i + 1 < order.length; i++) out.push([order[i]!, order[i + 1]!])
      break
    }
    case 'nearest-n': {
      const seen = new Set<string>()
      for (let i = 0; i < n; i++) {
        const dists = nodes
          .map((nd, j) => ({ j, d: Math.hypot(nd.x - nodes[i]!.x, nd.y - nodes[i]!.y) }))
          .filter((o) => o.j !== i)
          .sort((a, b) => a.d - b.d)
          .slice(0, p.linkNearestN)
        for (const o of dists) {
          const key = i < o.j ? `${i}-${o.j}` : `${o.j}-${i}`
          if (seen.has(key)) continue
          seen.add(key)
          out.push([nodes[i]!, nodes[o.j]!])
        }
      }
      break
    }
    case 'delaunay':
      for (const [i, j] of delaunayEdges(nodes)) out.push([nodes[i]!, nodes[j]!])
      break
    case 'to-center': {
      const center: Node = { x: view.width / 2, y: view.height / 2, color: '#ffffff', alpha: 1 }
      for (const nd of nodes) out.push([nd, { ...center, color: nd.color, alpha: nd.alpha }])
      break
    }
    case 'to-largest': {
      let bi = 0
      for (let i = 1; i < items.length; i++) if (items[i]!.track.area > items[bi]!.track.area) bi = i
      for (let i = 0; i < n; i++) if (i !== bi) out.push([nodes[i]!, nodes[bi]!])
      break
    }
    default:
      break
  }
  return out
}

/** Kaba kuvvet Delaunay: çevrel çemberi boş olan üçgenlerin kenarları. */
function delaunayEdges(nodes: { x: number; y: number }[]): [number, number][] {
  const n = nodes.length
  const edges = new Set<string>()
  if (n < 3) {
    if (n === 2) return [[0, 1]]
    return []
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let k = j + 1; k < n; k++) {
        const c = circumcircle(nodes[i]!, nodes[j]!, nodes[k]!)
        if (!c) continue
        let empty = true
        for (let m = 0; m < n; m++) {
          if (m === i || m === j || m === k) continue
          const d = Math.hypot(nodes[m]!.x - c.x, nodes[m]!.y - c.y)
          if (d < c.r - 1e-6) {
            empty = false
            break
          }
        }
        if (empty) {
          edges.add(`${i}-${j}`)
          edges.add(`${j}-${k}`)
          edges.add(`${i}-${k}`)
        }
      }
    }
  }
  return [...edges].map((e) => e.split('-').map(Number) as [number, number])
}

function circumcircle(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
): { x: number; y: number; r: number } | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y))
  if (Math.abs(d) < 1e-9) return null
  const a2 = a.x * a.x + a.y * a.y
  const b2 = b.x * b.x + b.y * b.y
  const c2 = c.x * c.x + c.y * c.y
  const ux = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d
  const uy = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d
  return { x: ux, y: uy, r: Math.hypot(a.x - ux, a.y - uy) }
}
