import { Scratch } from './pool'
import { applyLut, boxBlur, buildLevelsLut, sobel, toGray } from './preprocess'
import {
  applyThreshold,
  scoreAdaptive,
  scoreBackground,
  scoreChroma,
  scoreDiff,
  scoreLuminance,
  type KeySpace,
} from './threshold'
import { close, open } from './morphology'
import { labelBlobs } from './connectedComponents'
import { Tracker } from './tracker'
import { convexHull, decimate, simplify, traceContour } from './contours'
import type { FrameResult, Point, RawBlob } from './types'
import type { Params } from '../store/paramSchema'
import { MAX_ADVANCE_GAP } from './frameGap'

/**
 * Pipeline — kare başına tüm CV adımlarını sırayla çalıştıran tek giriş noktası.
 *
 *   gray → blur → levels → skor (kaynak modu) → eşik (+histerezis)
 *        → open/close → connected components → birleştir/filtrele/sırala
 *
 * Zamansal modlar (diff / background) durum tutar; ardışık olmayan karelerde
 * (scrub, seek) bu durum sıfırlanır. Saf hesap; DOM ve React yok.
 *
 * DİKKAT: dönen `mask` pipeline'ın iç buffer'ıdır, bir sonraki `process()`
 * çağrısına kadar geçerlidir.
 */
export class Pipeline {
  private scratch = new Scratch()
  private tracker = new Tracker()
  private lastFrameIndex = -9999
  private lastW = 0
  private lastH = 0
  private lastMode = ''
  private bgFrozen = false
  private pendingBgCapture = false

  reset(): void {
    this.lastFrameIndex = -9999
    this.pendingBgCapture = true
    this.tracker.reset()
  }

  /** Mevcut kareyi referans arka plan olarak sabitler. */
  freezeBackground(): void {
    this.pendingBgCapture = true
  }

  /**
   * @param rgba  detection çözünürlüğündeki kare (RGBA)
   * @param scale detection genişliği / kaynak genişliği — piksel birimli
   *              parametreleri (blur, minWidth…) ölçeklemek için
   */
  process(
    rgba: Uint8ClampedArray,
    w: number,
    h: number,
    frameIndex: number,
    time: number,
    p: Params,
    scale: number,
    fps = 30,
  ): FrameResult {
    const t0 = performance.now()
    const n = w * h
    const s = this.scratch
    const gray = s.u8('gray', n)
    const tmp = s.u8('tmp', n)
    const score = s.u8('score', n)
    const mask = s.u8('mask', n)

    /**
     * Zamansal faz:
     *   advance — bir sonraki kare (normal oynatma)
     *   same    — AYNI kare yeniden işleniyor (parametre değişti). Zamansal
     *             durum anlık görüntüden geri yüklenir; böylece slider oynatmak
     *             hareket/arka plan modelini bozmaz ve sonuç deterministiktir.
     *   jump    — scrub / seek / boyut / mod değişimi → durum sıfırlanır
     */
    const dimsChanged = w !== this.lastW || h !== this.lastH
    const modeChanged = p.sourceMode !== this.lastMode
    const delta = frameIndex - this.lastFrameIndex
    // Worker meşgulken kare atlanabilir; küçük ileri sıçramalar hâlâ "advance"
    // sayılır, yoksa her düşen kare zamansal durumu ve ID'leri sıfırlardı.
    const phase: 'advance' | 'same' | 'jump' =
      dimsChanged || modeChanged
        ? 'jump'
        : delta > 0 && delta <= MAX_ADVANCE_GAP
          ? 'advance'
          : delta === 0
            ? 'same'
            : 'jump'
    this.lastW = w
    this.lastH = h
    this.lastMode = p.sourceMode
    this.lastFrameIndex = frameIndex

    /* 1 · gri tonlama */
    toGray(rgba, gray)

    /* 2 · bulanıklaştırma (yarıçap detection ölçeğine indirgenir) */
    if (p.blurRadius > 0) boxBlur(gray, tmp, w, h, Math.max(1, Math.round(p.blurRadius * scale)))

    /* 3 · seviyeler */
    if (p.brightness !== 0 || p.contrast !== 0 || p.gamma !== 1 || p.preInvert) {
      const lut = s.u8('lut', 256)
      buildLevelsLut(lut, p.brightness, p.contrast, p.gamma, p.preInvert)
      applyLut(gray, lut)
    }

    /* 4 · kaynak moduna göre blobness skoru + eşik değeri */
    let high = 128
    let low: number | null = null

    switch (p.sourceMode) {
      case 'luminance': {
        if (p.adaptive) {
          const integral = s.i32('integral', (w + 1) * (h + 1))
          scoreAdaptive(gray, score, w, h, p.adaptiveBlock, integral, p.thresholdInvert)
          high = 128 + p.adaptiveC
        } else {
          scoreLuminance(gray, score, p.thresholdInvert)
          high = p.thresholdInvert ? 255 - p.threshold : p.threshold
        }
        break
      }
      case 'chroma': {
        scoreChroma(rgba, score, hexToRgb(p.keyColor), p.keySpace as KeySpace, p.keyInvert)
        high = (p.keyTolerance + p.keySoftness * 0.5) * 255
        if (p.keySoftness > 0) low = Math.max(0, (p.keyTolerance - p.keySoftness * 0.5) * 255)
        break
      }
      case 'diff': {
        const prev = s.u8('prevGray', n)
        const cur = s.u8('curGray', n)
        const acc = s.f32('motionAcc', n)
        const accSnap = s.f32('motionAccSnap', n)
        if (phase === 'jump') {
          prev.set(gray)
          cur.set(gray)
          acc.fill(0)
          accSnap.fill(0)
        } else if (phase === 'advance') {
          prev.set(cur)
          cur.set(gray)
          accSnap.set(acc)
        } else {
          acc.set(accSnap)
        }
        scoreDiff(gray, prev, acc, score, p.diffPersistence)
        high = p.diffThreshold
        break
      }
      case 'background': {
        const model = s.f32('bgModel', n)
        const snap = s.f32('bgModelSnap', n)
        const justFroze = p.bgFreeze && !this.bgFrozen
        this.bgFrozen = p.bgFreeze
        if (phase === 'jump' || justFroze || this.pendingBgCapture) {
          model.set(gray)
          snap.set(model)
          this.pendingBgCapture = false
        } else if (phase === 'advance') {
          snap.set(model)
        } else {
          model.set(snap)
        }
        scoreBackground(gray, model, score, p.bgFreeze ? 0 : p.bgLearningRate)
        high = p.bgThreshold
        break
      }
      case 'edge': {
        sobel(gray, score, w, h)
        high = p.edgeThreshold
        break
      }
    }

    if (p.hysteresis) {
      const l = high * p.hysteresisLow
      low = low === null ? l : Math.min(low, l)
    }

    /* 5 · eşikleme */
    const stack = s.i32('stack', n)
    applyThreshold(score, mask, high, low, w, h, stack)

    /* 6 · morfoloji */
    const k = Number(p.morphKernel)
    if (p.noiseReduction > 0) open(mask, tmp, w, h, k, p.noiseReduction)
    if (p.fillHoles > 0) close(mask, tmp, w, h, k, p.fillHoles)

    /* 7 · bağlantılı bileşenler */
    const labels = s.i32('labels', n)
    const parent = s.i32('parent', Math.max(64, (n >> 1) + 2))
    let blobs = labelBlobs(mask, w, h, { labels, parent })

    /* 8 · birleştirme → filtreleme → sıralama → üst sınır */
    const diag = Math.hypot(w, h)
    if (p.mergeDistance > 0) blobs = mergeBlobs(blobs, (p.mergeDistance / 100) * diag, w, h)
    blobs = filterBlobs(blobs, p, n, scale)
    blobs.sort((a, b) => b.area - a.area)
    if (blobs.length > p.maxBlobs) blobs.length = p.maxBlobs

    /* 8b · konturlar (yalnızca gerektiğinde — pahalı) */
    if (p.contourMode !== 'off') {
      for (const b of blobs) b.contour = blobContour(labels, w, h, b, p, scale)
    }

    /* 9 · takip */
    const tracks = p.trackingEnabled ? this.tracker.update(blobs, frameIndex, p, w, h, fps) : []

    return {
      frameIndex,
      time,
      detectionWidth: w,
      detectionHeight: h,
      mask: { data: mask, width: w, height: h },
      blobs,
      tracks,
      msDetect: performance.now() - t0,
    }
  }
}

/** Blobun etiketini bbox içinde bulup sınırını çıkarır; moda göre sadeleştirir. */
function blobContour(
  labels: Int32Array,
  w: number,
  h: number,
  b: RawBlob,
  p: Params,
  scale: number,
): Point[] | null {
  let sx = -1
  let sy = -1
  outer: for (let y = b.bbox.y; y < b.bbox.y + b.bbox.h; y++) {
    for (let x = b.bbox.x; x < b.bbox.x + b.bbox.w; x++) {
      if (labels[y * w + x] === b.label) {
        sx = x
        sy = y
        break outer
      }
    }
  }
  if (sx < 0) return null
  const raw = traceContour(labels, w, h, b.label, sx, sy)
  if (raw.length < 3) return raw
  switch (p.contourMode) {
    case 'hull':
      return convexHull(raw)
    case 'polygon':
      return simplify(raw, Math.max(0.5, p.simplifyEpsilon * scale))
    default:
      return decimate(raw, raw.length > 600 ? 3 : 1)
  }
}

function filterBlobs(blobs: RawBlob[], p: Params, frameArea: number, scale: number): RawBlob[] {
  const minArea = (p.minArea / 100) * frameArea
  const maxArea = (p.maxArea / 100) * frameArea
  const minW = p.minWidth * scale
  const minH = p.minHeight * scale
  return blobs.filter((b) => {
    if (b.area < minArea || b.area > maxArea) return false
    if (b.bbox.w < minW || b.bbox.h < minH) return false
    if (b.aspect < p.aspectMin || b.aspect > p.aspectMax) return false
    if (p.edgeExclude && b.touchesEdge) return false
    return true
  })
}

/** Merkezleri `dist` mesafesinden yakın blobları union-find ile tek blob yapar. */
function mergeBlobs(blobs: RawBlob[], dist: number, w: number, h: number): RawBlob[] {
  const count = blobs.length
  if (count < 2 || dist <= 0) return blobs
  const parent = new Int32Array(count)
  for (let i = 0; i < count; i++) parent[i] = i
  const find = (x: number): number => {
    let r = x
    while (parent[r] !== r) r = parent[r]!
    return r
  }
  const d2 = dist * dist
  for (let i = 0; i < count; i++) {
    for (let j = i + 1; j < count; j++) {
      const a = blobs[i]!.centroid
      const b = blobs[j]!.centroid
      const dx = a.x - b.x
      const dy = a.y - b.y
      if (dx * dx + dy * dy <= d2) {
        const ri = find(i)
        const rj = find(j)
        if (ri !== rj) parent[Math.max(ri, rj)] = Math.min(ri, rj)
      }
    }
  }
  const groups = new Map<number, RawBlob[]>()
  for (let i = 0; i < count; i++) {
    const r = find(i)
    const g = groups.get(r)
    if (g) g.push(blobs[i]!)
    else groups.set(r, [blobs[i]!])
  }
  const out: RawBlob[] = []
  for (const group of groups.values()) {
    if (group.length === 1) {
      out.push(group[0]!)
      continue
    }
    let area = 0
    let sx = 0
    let sy = 0
    let perimeter = 0
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    let touchesEdge = false
    for (const b of group) {
      area += b.area
      sx += b.centroid.x * b.area
      sy += b.centroid.y * b.area
      perimeter += b.perimeter
      x0 = Math.min(x0, b.bbox.x)
      y0 = Math.min(y0, b.bbox.y)
      x1 = Math.max(x1, b.bbox.x + b.bbox.w)
      y1 = Math.max(y1, b.bbox.y + b.bbox.h)
      touchesEdge = touchesEdge || b.touchesEdge
    }
    const bw = x1 - x0
    const bh = y1 - y0
    out.push({
      label: group[0]!.label,
      area,
      bbox: { x: x0, y: y0, w: bw, h: bh },
      centroid: { x: sx / area, y: sy / area },
      perimeter,
      density: area / (bw * bh),
      aspect: bw / bh,
      touchesEdge: touchesEdge || x0 <= 0 || y0 <= 0 || x1 >= w || y1 >= h,
    })
  }
  return out
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m || !m[1]) return [0, 255, 0]
  const v = parseInt(m[1], 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}
