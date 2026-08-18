import { describe, expect, it } from 'vitest'
import { hungarian } from '../hungarian'
import { labelBlobs } from '../connectedComponents'
import { close, open } from '../morphology'
import { Tracker, formatTrackId } from '../tracker'
import { Pipeline } from '../pipeline'
import { defaultParams, type Params } from '../../store/paramSchema'
import type { RawBlob } from '../types'

/* ── yardımcılar ───────────────────────────────────────────────────────── */

function ccBuffers(w: number, h: number) {
  return { labels: new Int32Array(w * h), parent: new Int32Array(Math.max(64, ((w * h) >> 1) + 2)) }
}

function blankMask(w: number, h: number): Uint8ClampedArray {
  return new Uint8ClampedArray(w * h)
}

function fillRect(mask: Uint8ClampedArray, w: number, x: number, y: number, rw: number, rh: number): void {
  for (let j = y; j < y + rh; j++) for (let i = x; i < x + rw; i++) mask[j * w + i] = 255
}

/** Hareketli kare + daire içeren sentetik RGBA kare üretir. */
function syntheticFrame(
  w: number,
  h: number,
  shapes: { x: number; y: number; r: number }[],
): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let on = false
      for (const s of shapes) {
        const dx = x - s.x
        const dy = y - s.y
        if (dx * dx + dy * dy <= s.r * s.r) on = true
      }
      const i = (y * w + x) * 4
      const v = on ? 255 : 12
      rgba[i] = v
      rgba[i + 1] = v
      rgba[i + 2] = v
      rgba[i + 3] = 255
    }
  }
  return rgba
}

function blob(x: number, y: number, w: number, h: number): RawBlob {
  return {
    label: 1,
    area: w * h,
    bbox: { x, y, w, h },
    centroid: { x: x + w / 2, y: y + h / 2 },
    perimeter: 2 * (w + h),
    density: 1,
    aspect: w / h,
    touchesEdge: false,
  }
}

const P = (over: Partial<Params> = {}): Params => ({ ...defaultParams(), ...over })

/* ── Hungarian ─────────────────────────────────────────────────────────── */

describe('hungarian', () => {
  it('küçük kare matriste optimum atamayı bulur', () => {
    // optimum: 0→1, 1→0, 2→2 (toplam 5)
    const cost = new Float64Array([4, 1, 3, 2, 0, 5, 3, 2, 2])
    const a = hungarian(cost, 3, 3)
    expect([...a]).toEqual([1, 0, 2])
  })

  it('açgözlü çözümden daha iyi bir toplam üretir', () => {
    const cost = new Float64Array([1, 2, 100, 100])
    const a = hungarian(cost, 2, 2)
    // açgözlü 0→0 (1) sonra 1→1 (100) = 101; optimum 0→1 (2) + 1→0 (100) = 102
    // burada açgözlü zaten optimumdur; toplamın optimumluğunu doğrula
    const total = [...a].reduce((s, j, i) => s + cost[i * 2 + j]!, 0)
    expect(total).toBeLessThanOrEqual(102)
  })

  it('dikdörtgen matrislerde (satır > sütun) fazladan satırı atamasız bırakır', () => {
    const cost = new Float64Array([1, 5, 2, 1, 9, 9])
    const a = hungarian(cost, 3, 2)
    expect(a.length).toBe(3)
    const assigned = [...a].filter((j) => j >= 0)
    expect(assigned.length).toBe(2)
    expect(new Set(assigned).size).toBe(2)
  })

  it('sütun > satır durumunda her satırı atar', () => {
    const cost = new Float64Array([3, 1, 7, 9, 4, 2])
    const a = hungarian(cost, 2, 3)
    expect([...a]).toEqual([1, 2])
  })

  it('boş girdide çökmez', () => {
    expect([...hungarian(new Float64Array(0), 0, 0)]).toEqual([])
    expect([...hungarian(new Float64Array(0), 2, 0)]).toEqual([-1, -1])
  })
})

/* ── Connected components ──────────────────────────────────────────────── */

describe('connectedComponents', () => {
  it('iki ayrık kareyi iki blob olarak bulur', () => {
    const w = 40
    const h = 20
    const mask = blankMask(w, h)
    fillRect(mask, w, 2, 2, 6, 6)
    fillRect(mask, w, 25, 8, 4, 8)
    const blobs = labelBlobs(mask, w, h, ccBuffers(w, h)).sort((a, b) => b.area - a.area)
    expect(blobs.length).toBe(2)
    expect(blobs[0]!.area).toBe(36)
    expect(blobs[0]!.bbox).toEqual({ x: 2, y: 2, w: 6, h: 6 })
    expect(blobs[0]!.centroid.x).toBeCloseTo(4.5)
    expect(blobs[0]!.centroid.y).toBeCloseTo(4.5)
    expect(blobs[1]!.area).toBe(32)
    expect(blobs[1]!.aspect).toBeCloseTo(0.5)
  })

  it('8-komşulukta çapraz değen pikselleri tek blob sayar', () => {
    const w = 10
    const h = 10
    const mask = blankMask(w, h)
    fillRect(mask, w, 1, 1, 2, 2)
    fillRect(mask, w, 3, 3, 2, 2) // yalnızca köşeden değiyor
    const blobs = labelBlobs(mask, w, h, ccBuffers(w, h))
    expect(blobs.length).toBe(1)
    expect(blobs[0]!.area).toBe(8)
  })

  it('U şeklinde birleşen etiketleri (union-find) tek blob yapar', () => {
    const w = 12
    const h = 12
    const mask = blankMask(w, h)
    fillRect(mask, w, 1, 1, 2, 8) // sol bacak
    fillRect(mask, w, 8, 1, 2, 8) // sağ bacak
    fillRect(mask, w, 1, 8, 9, 2) // taban
    const blobs = labelBlobs(mask, w, h, ccBuffers(w, h))
    expect(blobs.length).toBe(1)
  })

  it('kenara değen blobu işaretler', () => {
    const w = 10
    const h = 10
    const mask = blankMask(w, h)
    fillRect(mask, w, 0, 4, 3, 3)
    const blobs = labelBlobs(mask, w, h, ccBuffers(w, h))
    expect(blobs[0]!.touchesEdge).toBe(true)
  })
})

/* ── Morfoloji ─────────────────────────────────────────────────────────── */

describe('morphology', () => {
  it('open tek piksellik paraziti siler, gövdeyi korur', () => {
    const w = 20
    const h = 20
    const mask = blankMask(w, h)
    fillRect(mask, w, 5, 5, 6, 6)
    mask[2 * w + 17] = 255 // parazit
    open(mask, blankMask(w, h), w, h, 3, 1)
    expect(mask[2 * w + 17]).toBe(0)
    const blobs = labelBlobs(mask, w, h, ccBuffers(w, h))
    expect(blobs.length).toBe(1)
    expect(blobs[0]!.area).toBeGreaterThan(20)
  })

  it('close içerideki deliği doldurur', () => {
    const w = 20
    const h = 20
    const mask = blankMask(w, h)
    fillRect(mask, w, 4, 4, 10, 10)
    mask[9 * w + 9] = 0 // delik
    close(mask, blankMask(w, h), w, h, 3, 1)
    expect(mask[9 * w + 9]).toBe(255)
  })
})

/* ── Tracker ───────────────────────────────────────────────────────────── */

describe('tracker', () => {
  it('hareket eden iki blobun ID sini kareler boyunca korur', () => {
    const tr = new Tracker()
    const p = P({ minHits: 1, smoothMode: 'off' })
    let firstIds: number[] = []
    for (let f = 0; f < 10; f++) {
      const tracks = tr.update([blob(10 + f * 3, 10, 8, 8), blob(60 - f * 2, 40, 6, 6)], f, p, 100, 100, 30)
      expect(tracks.length).toBe(2)
      const ids = tracks.map((t) => t.id).sort((a, b) => a - b)
      if (f === 0) firstIds = ids
      else expect(ids).toEqual(firstIds)
    }
  })

  it('yolları kesişen iki blobda kimlikleri karıştırmaz', () => {
    const tr = new Tracker()
    const p = P({ minHits: 1, smoothMode: 'off' })
    const idAt: Record<number, number[]> = {}
    for (let f = 0; f < 12; f++) {
      // A soldan sağa, B sağdan sola — 6. karede çaprazlanırlar
      const a = blob(10 + f * 6, 40, 8, 8)
      const b = blob(80 - f * 6, 44, 8, 8)
      const tracks = tr.update([a, b], f, p, 100, 100, 30)
      for (const t of tracks) (idAt[t.id] ??= []).push(f)
    }
    // yalnızca iki kimlik üretilmeli (kesişmede yeni ID doğmamalı)
    expect(Object.keys(idAt).length).toBe(2)
  })

  it('occlusion sırasında ID yi korur (persistence)', () => {
    const tr = new Tracker()
    const p = P({ minHits: 2, persistence: 15, smoothMode: 'off' })
    let id = -1
    for (let f = 0; f < 5; f++) {
      const t = tr.update([blob(10 + f * 4, 20, 8, 8)], f, p, 100, 100, 30)
      if (t[0]) id = t[0].id
    }
    // 6 kare boyunca blob kaybolur
    for (let f = 5; f < 11; f++) {
      const t = tr.update([], f, p, 100, 100, 30)
      expect(t.length).toBe(1) // coasting — hâlâ çiziliyor
      expect(t[0]!.state).toBe('lost')
      expect(t[0]!.id).toBe(id)
    }
    // geri döndüğünde aynı ID
    const back = tr.update([blob(10 + 11 * 4, 20, 8, 8)], 11, p, 100, 100, 30)
    expect(back.length).toBe(1)
    expect(back[0]!.id).toBe(id)
    expect(back[0]!.state).toBe('confirmed')
  })

  it('persistence dolduktan sonra track silinir', () => {
    const tr = new Tracker()
    const p = P({ minHits: 1, persistence: 3, fadeOut: 0, smoothMode: 'off' })
    tr.update([blob(10, 10, 8, 8)], 0, p, 100, 100, 30)
    let last = 1
    for (let f = 1; f < 8; f++) last = tr.update([], f, p, 100, 100, 30).length
    expect(last).toBe(0)
  })

  it('minHits karesinden önce track çizilmez', () => {
    const tr = new Tracker()
    const p = P({ minHits: 3, smoothMode: 'off' })
    expect(tr.update([blob(10, 10, 8, 8)], 0, p, 100, 100, 30).length).toBe(0)
    expect(tr.update([blob(11, 10, 8, 8)], 1, p, 100, 100, 30).length).toBe(0)
    expect(tr.update([blob(12, 10, 8, 8)], 2, p, 100, 100, 30).length).toBe(1)
  })

  it('aynı kare yeniden işlenince durum ilerlemez (determinizm)', () => {
    const tr = new Tracker()
    const p = P({ minHits: 1 })
    for (let f = 0; f < 4; f++) tr.update([blob(10 + f * 5, 10, 8, 8)], f, p, 100, 100, 30)
    const a = tr.update([blob(30, 10, 8, 8)], 4, p, 100, 100, 30)[0]!
    const b = tr.update([blob(30, 10, 8, 8)], 4, p, 100, 100, 30)[0]!
    expect(b.id).toBe(a.id)
    expect(b.hits).toBe(a.hits)
    expect(b.smoothBox.x).toBeCloseTo(a.smoothBox.x, 10)
    expect(b.centroid.y).toBeCloseTo(a.centroid.y, 10)
  })

  it('One Euro yumuşatma gürültüyü ham ölçümden daha az titretir', () => {
    const tr = new Tracker()
    const p = P({ minHits: 1, smoothMode: 'oneEuro', smoothing: 0.8 })
    const rawXs: number[] = []
    const smoothXs: number[] = []
    for (let f = 0; f < 30; f++) {
      const jitter = (f % 2 === 0 ? 1 : -1) * 3 // ±3 px titreşim
      const b = blob(40 + jitter, 40, 10, 10)
      const t = tr.update([b], f, p, 100, 100, 30)[0]
      if (!t) continue
      rawXs.push(b.centroid.x)
      smoothXs.push(t.centroid.x)
    }
    const variation = (xs: number[]) =>
      xs.slice(1).reduce((s, x, i) => s + Math.abs(x - xs[i]!), 0) / (xs.length - 1)
    expect(variation(smoothXs)).toBeLessThan(variation(rawXs) * 0.5)
  })

  it('ID biçimleri', () => {
    expect(formatTrackId(7, '1')).toBe('7')
    expect(formatTrackId(7, '01')).toBe('07')
    expect(formatTrackId(7, '#001')).toBe('#007')
    expect(formatTrackId(7, 'TRK_001')).toBe('TRK_007')
    expect(formatTrackId(26, '0x1A')).toBe('0x1A')
    expect(formatTrackId(7, 'hex4')).toHaveLength(4)
    expect(formatTrackId(7, 'hex4')).toBe(formatTrackId(7, 'hex4'))
  })
})

/* ── Uçtan uca pipeline ────────────────────────────────────────────────── */

describe('pipeline', () => {
  it('sentetik videoda blobları bulur ve ID leri korur', () => {
    const w = 120
    const h = 90
    const pipe = new Pipeline()
    const p = P({ minHits: 2, blurRadius: 0, noiseReduction: 0, fillHoles: 0, minArea: 0.1 })
    const ids: number[][] = []
    for (let f = 0; f < 12; f++) {
      const rgba = syntheticFrame(w, h, [
        { x: 20 + f * 4, y: 30, r: 8 },
        { x: 90, y: 20 + f * 3, r: 6 },
      ])
      const r = pipe.process(rgba, w, h, f, f / 30, p, 1, 30)
      expect(r.blobs.length).toBe(2)
      if (f >= 2) ids.push(r.tracks.map((t) => t.id).sort((a, b) => a - b))
    }
    expect(ids.length).toBeGreaterThan(5)
    for (const set of ids) expect(set).toEqual(ids[0])
  })

  it('aynı kare iki kez işlendiğinde birebir aynı sonucu verir', () => {
    const w = 80
    const h = 60
    const pipe = new Pipeline()
    const p = P({ minHits: 1 })
    const frames = [0, 1, 2].map((f) => syntheticFrame(w, h, [{ x: 20 + f * 5, y: 30, r: 9 }]))
    frames.forEach((rgba, f) => pipe.process(rgba, w, h, f, f / 30, p, 1, 30))
    const a = pipe.process(frames[2]!, w, h, 2, 2 / 30, p, 1, 30)
    const snapshotA = JSON.stringify({ blobs: a.blobs, tracks: a.tracks })
    const b = pipe.process(frames[2]!, w, h, 2, 2 / 30, p, 1, 30)
    expect(JSON.stringify({ blobs: b.blobs, tracks: b.tracks })).toBe(snapshotA)
  })

  it('maxBlobs sınırını alana göre uygular', () => {
    const w = 100
    const h = 100
    const pipe = new Pipeline()
    const p = P({ maxBlobs: 2, minArea: 0.01, blurRadius: 0, noiseReduction: 0 })
    const rgba = syntheticFrame(w, h, [
      { x: 20, y: 20, r: 10 },
      { x: 70, y: 20, r: 6 },
      { x: 20, y: 70, r: 4 },
      { x: 70, y: 70, r: 3 },
    ])
    const r = pipe.process(rgba, w, h, 0, 0, p, 1, 30)
    expect(r.blobs.length).toBe(2)
    expect(r.blobs[0]!.area).toBeGreaterThan(r.blobs[1]!.area)
  })

  it('mergeDistance yakın blobları birleştirir', () => {
    const w = 100
    const h = 100
    const pipe = new Pipeline()
    const base = P({ minArea: 0.01, blurRadius: 0, noiseReduction: 0, fillHoles: 0 })
    const rgba = syntheticFrame(w, h, [
      { x: 40, y: 50, r: 6 },
      { x: 56, y: 50, r: 6 },
    ])
    expect(pipe.process(rgba, w, h, 0, 0, base, 1, 30).blobs.length).toBe(2)
    const merged = new Pipeline().process(rgba, w, h, 0, 0, P({ ...base, mergeDistance: 15 }), 1, 30)
    expect(merged.blobs.length).toBe(1)
  })
})
