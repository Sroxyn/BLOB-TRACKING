import type { RawBlob } from './types'

/**
 * Bağlantılı bileşen etiketleme — iki geçişli union-find, 8-komşuluk.
 *
 * 1. geçiş: her ön plan pikseli için batı / kuzeybatı / kuzey / kuzeydoğu
 *    komşularına bak; en küçük etiketi al, diğerlerini union et.
 * 2. geçiş: etiketleri köke indirge ve istatistikleri (alan, bbox, moment
 *    toplamları, çevre) tek geçişte biriktir.
 *
 * Çevre: en az bir 4-komşusu arka plan olan (veya kare kenarındaki) piksel sayısı.
 */

export interface CCBuffers {
  labels: Int32Array
  parent: Int32Array
}

function findRoot(parent: Int32Array, x: number): number {
  let root = x
  while (parent[root] !== root) root = parent[root]!
  // yol sıkıştırma
  let cur = x
  while (parent[cur] !== root) {
    const next = parent[cur]!
    parent[cur] = root
    cur = next
  }
  return root
}

function union(parent: Int32Array, a: number, b: number): void {
  const ra = findRoot(parent, a)
  const rb = findRoot(parent, b)
  if (ra === rb) return
  if (ra < rb) parent[rb] = ra
  else parent[ra] = rb
}

export function labelBlobs(
  mask: Uint8ClampedArray,
  w: number,
  h: number,
  buffers: CCBuffers,
): RawBlob[] {
  const { labels, parent } = buffers
  labels.fill(0)
  let next = 1
  parent[0] = 0

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (!mask[i]) continue
      const west = x > 0 ? labels[i - 1]! : 0
      const north = y > 0 ? labels[i - w]! : 0
      const nw = x > 0 && y > 0 ? labels[i - w - 1]! : 0
      const ne = x < w - 1 && y > 0 ? labels[i - w + 1]! : 0

      let best = 0
      if (west && (!best || west < best)) best = west
      if (north && (!best || north < best)) best = north
      if (nw && (!best || nw < best)) best = nw
      if (ne && (!best || ne < best)) best = ne

      if (!best) {
        if (next >= parent.length) continue // taşma koruması
        parent[next] = next
        labels[i] = next
        next++
      } else {
        labels[i] = best
        if (west && west !== best) union(parent, west, best)
        if (north && north !== best) union(parent, north, best)
        if (nw && nw !== best) union(parent, nw, best)
        if (ne && ne !== best) union(parent, ne, best)
      }
    }
  }

  if (next <= 1) return []

  // Kök etiketleri sıkıştır
  const remap = new Int32Array(next)
  let count = 0
  for (let l = 1; l < next; l++) {
    if (findRoot(parent, l) === l) remap[l] = count++
  }
  if (count === 0) return []

  const area = new Int32Array(count)
  const sumX = new Float64Array(count)
  const sumY = new Float64Array(count)
  const minX = new Int32Array(count).fill(w)
  const minY = new Int32Array(count).fill(h)
  const maxX = new Int32Array(count).fill(-1)
  const maxY = new Int32Array(count).fill(-1)
  const perim = new Int32Array(count)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const l = labels[i]!
      if (!l) continue
      const c = remap[findRoot(parent, l)]!
      labels[i] = c + 1
      area[c]!++
      sumX[c]! += x
      sumY[c]! += y
      if (x < minX[c]!) minX[c] = x
      if (x > maxX[c]!) maxX[c] = x
      if (y < minY[c]!) minY[c] = y
      if (y > maxY[c]!) maxY[c] = y
      const edge =
        x === 0 || y === 0 || x === w - 1 || y === h - 1 ||
        !mask[i - 1] || !mask[i + 1] || !mask[i - w] || !mask[i + w]
      if (edge) perim[c]!++
    }
  }

  const blobs: RawBlob[] = []
  for (let c = 0; c < count; c++) {
    const a = area[c]!
    if (a === 0) continue
    const bx = minX[c]!
    const by = minY[c]!
    const bw = maxX[c]! - bx + 1
    const bh = maxY[c]! - by + 1
    blobs.push({
      label: c + 1,
      area: a,
      bbox: { x: bx, y: by, w: bw, h: bh },
      centroid: { x: sumX[c]! / a, y: sumY[c]! / a },
      perimeter: perim[c]!,
      density: a / (bw * bh),
      aspect: bw / bh,
      touchesEdge: bx === 0 || by === 0 || bx + bw >= w || by + bh >= h,
    })
  }
  return blobs
}
