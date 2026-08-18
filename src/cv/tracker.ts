import { hungarian } from './hungarian'
import { copyEuroState, euroFilter, newEuroState, smoothingToCutoff, type EuroState } from './oneEuro'
import type { Point, RawBlob, Rect, Track, TrackState } from './types'
import type { Params } from '../store/paramSchema'
import { MAX_ADVANCE_GAP } from './frameGap'

/**
 * Tracker — kareler arası kimlik sürekliliği.
 *
 * 1. Her track sabit-hız modeliyle bir sonraki kareye TAHMİN edilir.
 * 2. Tahmin × detection maliyet matrisi kurulur:
 *      cost = wD·(mesafe/köşegen) + wIoU·(1−IoU) + wA·|log(alan oranı)|
 *    (ağırlık toplamına bölünür → maxCost eşiği ağırlıklardan bağımsız kalır)
 * 3. Hungarian ile global optimum atama; maxCost üstü eşleşmeler reddedilir.
 * 4. Eşleşmeyen detection → yeni track (tentative). Eşleşmeyen track → yaşlanır,
 *    tahminiyle kaymaya devam eder (occlusion), persistence sonunda silinir.
 * 5. Merkez ve kutu One Euro (veya EMA) ile yumuşatılır.
 *
 * Aynı karenin yeniden işlenmesi (parametre değişimi) durumu bozmaz: her kare
 * ilerlemesinde anlık görüntü alınır, aynı kare tekrar gelirse geri yüklenir.
 */

interface InternalTrack {
  id: number
  box: Rect
  smooth: { cx: number; cy: number; w: number; h: number }
  filters: [EuroState, EuroState, EuroState, EuroState]
  velocity: Point
  area: number
  hits: number
  age: number
  totalFrames: number
  birthFrame: number
  lostSince: number | null
  state: TrackState
  trail: Point[]
  confidence: number
  contour: Point[] | null
}

function copyTrack(t: InternalTrack): InternalTrack {
  return {
    ...t,
    box: { ...t.box },
    smooth: { ...t.smooth },
    filters: [
      copyEuroState(t.filters[0]),
      copyEuroState(t.filters[1]),
      copyEuroState(t.filters[2]),
      copyEuroState(t.filters[3]),
    ],
    velocity: { ...t.velocity },
    trail: t.trail.map((p) => ({ x: p.x, y: p.y })),
  }
}

function iou(a: Rect, b: Rect): number {
  const x0 = Math.max(a.x, b.x)
  const y0 = Math.max(a.y, b.y)
  const x1 = Math.min(a.x + a.w, b.x + b.w)
  const y1 = Math.min(a.y + a.h, b.y + b.h)
  const iw = x1 - x0
  const ih = y1 - y0
  if (iw <= 0 || ih <= 0) return 0
  const inter = iw * ih
  return inter / (a.w * a.h + b.w * b.h - inter)
}

export class Tracker {
  private tracks: InternalTrack[] = []
  private nextId = 1
  private lastFrame = -9999
  private snapshot: { tracks: InternalTrack[]; nextId: number } | null = null

  reset(): void {
    this.tracks = []
    this.nextId = 1
    this.lastFrame = -9999
    this.snapshot = null
  }

  update(blobs: RawBlob[], frameIndex: number, p: Params, w: number, h: number, fps: number): Track[] {
    const delta = frameIndex - this.lastFrame
    if (delta === 0 && this.snapshot) {
      // aynı kare yeniden işleniyor → durumu geri yükle (deterministik)
      this.tracks = this.snapshot.tracks.map(copyTrack)
      this.nextId = this.snapshot.nextId
    } else if (delta > 0 && delta <= MAX_ADVANCE_GAP) {
      this.snapshot = { tracks: this.tracks.map(copyTrack), nextId: this.nextId }
    } else {
      this.tracks = []
      this.nextId = 1
      this.snapshot = { tracks: [], nextId: 1 }
    }
    this.lastFrame = frameIndex

    const diag = Math.hypot(w, h)
    const dt = 1 / Math.max(1, fps)

    /* 1 · tahmin */
    const predicted = this.tracks.map((t) => ({
      cx: t.smooth.cx + t.velocity.x,
      cy: t.smooth.cy + t.velocity.y,
      box: {
        x: t.box.x + t.velocity.x,
        y: t.box.y + t.velocity.y,
        w: t.box.w,
        h: t.box.h,
      } as Rect,
    }))

    /* 2 · maliyet matrisi */
    const rows = this.tracks.length
    const cols = blobs.length
    const wSum = Math.max(1e-6, p.costDistance + p.costIoU + p.costArea)
    const cost = new Float64Array(rows * cols)
    for (let i = 0; i < rows; i++) {
      const tr = this.tracks[i]!
      const pr = predicted[i]!
      for (let j = 0; j < cols; j++) {
        const b = blobs[j]!
        const dx = pr.cx - b.centroid.x
        const dy = pr.cy - b.centroid.y
        const dist = Math.hypot(dx, dy) / diag
        const overlap = 1 - iou(pr.box, b.bbox)
        const ratio = Math.abs(Math.log(Math.max(1e-6, b.area) / Math.max(1e-6, tr.area)))
        cost[i * cols + j] =
          (p.costDistance * Math.min(1, dist * 3) + p.costIoU * overlap + p.costArea * Math.min(1, ratio / 2)) / wSum
      }
    }

    /* 3 · atama */
    const assign = rows && cols ? hungarian(cost, rows, cols) : new Int32Array(rows).fill(-1)
    const detUsed = new Uint8Array(cols)
    const matched = new Int32Array(rows).fill(-1)
    for (let i = 0; i < rows; i++) {
      const j = assign[i]
      if (j >= 0 && cost[i * cols + j] <= p.maxCost) {
        matched[i] = j
        detUsed[j] = 1
      }
    }

    /* 4 · eşleşen track'leri güncelle */
    const minCutoff = smoothingToCutoff(p.smoothing)
    const trailMax = Math.max(0, p.trailLength)
    for (let i = 0; i < rows; i++) {
      const t = this.tracks[i]!
      const j = matched[i]
      t.totalFrames++
      if (j < 0) {
        // eşleşmedi: tahminle kaymaya devam et (occlusion)
        t.age++
        if (t.lostSince === null) t.lostSince = frameIndex
        t.state = 'lost'
        t.confidence *= 0.8
        t.box = { ...predicted[i]!.box }
        t.smooth.cx = predicted[i]!.cx
        t.smooth.cy = predicted[i]!.cy
        t.filters[0].x = t.smooth.cx
        t.filters[1].x = t.smooth.cy
        if (trailMax > 0) pushTrail(t.trail, { x: t.smooth.cx, y: t.smooth.cy }, trailMax)
        continue
      }
      const b = blobs[j]!
      const prevCx = t.smooth.cx
      const prevCy = t.smooth.cy
      t.box = { ...b.bbox }
      t.area = b.area
      t.hits++
      t.age = 0
      t.lostSince = null
      t.contour = b.contour ?? null
      t.confidence = Math.min(1, 1 - cost[i * cols + j] / Math.max(1e-6, p.maxCost) * 0.5)
      t.state = t.hits >= p.minHits ? 'confirmed' : 'tentative'
      smoothInto(t, b, p, dt, minCutoff)
      t.velocity = { x: t.smooth.cx - prevCx, y: t.smooth.cy - prevCy }
      if (trailMax > 0) pushTrail(t.trail, { x: t.smooth.cx, y: t.smooth.cy }, trailMax)
      else t.trail.length = 0
    }

    /* 5 · eşleşmeyen detection'lar → yeni track */
    for (let j = 0; j < cols; j++) {
      if (detUsed[j]) continue
      const b = blobs[j]!
      const t: InternalTrack = {
        id: this.nextId++,
        box: { ...b.bbox },
        smooth: { cx: b.centroid.x, cy: b.centroid.y, w: b.bbox.w, h: b.bbox.h },
        filters: [newEuroState(), newEuroState(), newEuroState(), newEuroState()],
        velocity: { x: 0, y: 0 },
        area: b.area,
        hits: 1,
        age: 0,
        totalFrames: 1,
        birthFrame: frameIndex,
        lostSince: null,
        state: p.minHits <= 1 ? 'confirmed' : 'tentative',
        trail: trailMax > 0 ? [{ x: b.centroid.x, y: b.centroid.y }] : [],
        confidence: 0.5,
        contour: b.contour ?? null,
      }
      smoothInto(t, b, p, dt, minCutoff)
      this.tracks.push(t)
    }

    /* 6 · süresi dolanları sil */
    this.tracks = this.tracks.filter((t) => t.age <= p.persistence + p.fadeOut)

    /* 7 · çizilebilir track listesi */
    const out: Track[] = []
    for (const t of this.tracks) {
      if (t.hits < p.minHits) continue
      out.push({
        id: t.id,
        label: formatTrackId(t.id, p.idFormat),
        box: { ...t.box },
        smoothBox: {
          x: t.smooth.cx - t.smooth.w / 2,
          y: t.smooth.cy - t.smooth.h / 2,
          w: t.smooth.w,
          h: t.smooth.h,
        },
        centroid: { x: t.smooth.cx, y: t.smooth.cy },
        velocity: { ...t.velocity },
        area: t.area,
        age: t.age,
        hits: t.hits,
        totalFrames: t.totalFrames,
        birthFrame: t.birthFrame,
        lostSince: t.lostSince,
        state: t.state,
        trail: t.trail.slice(-Math.max(1, trailMax)),
        colorIndex: t.id,
        contour: t.contour,
        confidence: t.confidence,
      })
    }
    return out
  }
}

function smoothInto(t: InternalTrack, b: RawBlob, p: Params, dt: number, minCutoff: number): void {
  const targets = [b.centroid.x, b.centroid.y, b.bbox.w, b.bbox.h]
  const keys = ['cx', 'cy', 'w', 'h'] as const
  for (let k = 0; k < 4; k++) {
    const target = targets[k]!
    const st = t.filters[k]!
    let value: number
    if (p.smoothMode === 'off') {
      value = target
      st.x = target
      st.init = true
    } else if (p.smoothMode === 'ema') {
      if (!st.init) {
        st.x = target
        st.init = true
      } else {
        st.x = st.x + (1 - p.smoothing) * (target - st.x)
      }
      value = st.x
    } else {
      // beta doğrudan px/s hızıyla çarpılır; ölçek büyütmesi filtreyi etkisizleştirir
      value = euroFilter(st, target, dt, minCutoff, p.oneEuroBeta)
    }
    t.smooth[keys[k]!] = value
  }
}

function pushTrail(trail: Point[], p: Point, max: number): void {
  trail.push(p)
  if (trail.length > max) trail.splice(0, trail.length - max)
}

/** ID biçimleri: 1 · 01 · #001 · TRK_001 · 0x1A · rastgele görünümlü 4 haneli hex */
export function formatTrackId(id: number, format: Params['idFormat']): string {
  switch (format) {
    case '1':
      return String(id)
    case '01':
      return String(id).padStart(2, '0')
    case '#001':
      return `#${String(id).padStart(3, '0')}`
    case 'TRK_001':
      return `TRK_${String(id).padStart(3, '0')}`
    case '0x1A':
      return `0x${id.toString(16).toUpperCase()}`
    case 'hex4': {
      // deterministik karıştırma — ardışık ID'ler bile rastgele görünür
      let x = (id * 2654435761) >>> 0
      x ^= x >>> 15
      x = (x * 2246822519) >>> 0
      return x.toString(16).toUpperCase().padStart(8, '0').slice(0, 4)
    }
  }
}
