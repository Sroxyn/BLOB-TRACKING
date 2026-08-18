import type { Point } from './types'

/**
 * Kontur araçları.
 *
 * · traceContour: Moore-neighbor sınır takibi (Jacob durdurma ölçütü) —
 *   etiket haritası üzerinde tek bir blobun dış sınırını saat yönünde çıkarır.
 * · convexHull: Andrew monotone chain, O(n log n).
 * · simplify: Douglas–Peucker — noktaları epsilon toleransıyla seyreltir.
 */

/** 8-komşuluk sırası (saat yönü), (dx, dy) */
const NB: readonly [number, number][] = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
]

export function traceContour(
  labels: Int32Array,
  w: number,
  h: number,
  label: number,
  startX: number,
  startY: number,
  maxPoints = 4000,
): Point[] {
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : labels[y * w + x])
  const out: Point[] = [{ x: startX, y: startY }]
  let cx = startX
  let cy = startY
  let dir = 6 // yukarıdan geldik varsayımı
  const firstX = startX
  const firstY = startY
  let steps = 0

  while (steps++ < maxPoints) {
    let found = false
    // bir önceki yönün sağından başlayarak komşuları tara
    for (let i = 0; i < 8; i++) {
      const d = (dir + 6 + i) % 8
      const [dx, dy] = NB[d]!
      const nx = cx + dx
      const ny = cy + dy
      if (at(nx, ny) === label) {
        cx = nx
        cy = ny
        dir = d
        out.push({ x: cx, y: cy })
        found = true
        break
      }
    }
    if (!found) break // tek piksellik blob
    if (cx === firstX && cy === firstY) break
  }
  return out
}

export function convexHull(points: Point[]): Point[] {
  if (points.length < 4) return points.slice()
  const pts = points.slice().sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x))
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: Point[] = []
  for (const pt of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, pt) <= 0) lower.pop()
    lower.push(pt)
  }
  const upper: Point[] = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const pt = pts[i]!
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, pt) <= 0) upper.pop()
    upper.push(pt)
  }
  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

export function simplify(points: Point[], epsilon: number): Point[] {
  if (points.length < 3 || epsilon <= 0) return points.slice()
  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1
  const stack: [number, number][] = [[0, points.length - 1]]
  while (stack.length) {
    const [start, end] = stack.pop()!
    const a = points[start]!
    const b = points[end]!
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy) || 1
    let maxDist = -1
    let maxIdx = -1
    for (let i = start + 1; i < end; i++) {
      const p = points[i]!
      const dist = Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len
      if (dist > maxDist) {
        maxDist = dist
        maxIdx = i
      }
    }
    if (maxDist > epsilon && maxIdx > 0) {
      keep[maxIdx] = 1
      stack.push([start, maxIdx], [maxIdx, end])
    }
  }
  const out: Point[] = []
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push(points[i]!)
  return out
}

/** Kontur noktalarını seyreltir (uzun sınırlarda çizim maliyetini düşürür). */
export function decimate(points: Point[], step: number): Point[] {
  if (step <= 1 || points.length <= 8) return points
  const out: Point[] = []
  for (let i = 0; i < points.length; i += step) out.push(points[i]!)
  const last = points[points.length - 1]!
  if (out[out.length - 1] !== last) out.push(last)
  return out
}
