/**
 * Binarizasyon — beş kaynak modu tek bir soyutlamada birleşir:
 *
 *   1) mod bir "blobness" skoru (0..255) üretir
 *   2) ortak eşikleme adımı skoru ikili maskeye çevirir
 *      (isteğe bağlı histerezis: zayıf pikseller ancak güçlülere BAĞLIYSA kalır)
 *
 * Bu ayrım sayesinde adaptive/hysteresis her mod için tek yerde yazılır.
 * Tüm fonksiyonlar saf: girdi + çıkış buffer'ı alır, DOM'a dokunmaz.
 */

export type ScoreBuf = Uint8ClampedArray

/** score = gray (invert ise 255 - gray) */
export function scoreLuminance(gray: Uint8ClampedArray, out: ScoreBuf, invert: boolean): void {
  if (invert) for (let i = 0; i < out.length; i++) out[i] = 255 - gray[i]!
  else out.set(gray)
}

/**
 * Adaptif skor: piksel − yerel ortalama + 128 (integral görüntü ile O(1)/piksel).
 * Eşik 128 + bias olarak uygulanır.
 */
export function scoreAdaptive(
  gray: Uint8ClampedArray,
  out: ScoreBuf,
  w: number,
  h: number,
  block: number,
  integral: Int32Array,
  invert: boolean,
): void {
  const iw = w + 1
  integral.fill(0, 0, iw)
  for (let y = 0; y < h; y++) {
    let rowSum = 0
    for (let x = 0; x < w; x++) {
      rowSum += gray[y * w + x]!
      integral[(y + 1) * iw + (x + 1)] = integral[y * iw + (x + 1)]! + rowSum
    }
    integral[(y + 1) * iw] = 0
  }
  const r = Math.max(1, (block - 1) >> 1)
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r)
    const y1 = Math.min(h - 1, y + r)
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r)
      const x1 = Math.min(w - 1, x + r)
      const area = (x1 - x0 + 1) * (y1 - y0 + 1)
      const sum =
        integral[(y1 + 1) * iw + (x1 + 1)]! -
        integral[y0 * iw + (x1 + 1)]! -
        integral[(y1 + 1) * iw + x0]! +
        integral[y0 * iw + x0]!
      const mean = sum / area
      const px = gray[y * w + x]!
      const d = invert ? mean - px : px - mean
      out[y * w + x] = d + 128
    }
  }
}

export type KeySpace = 'hsv' | 'rgb'

/**
 * Chroma key skoru. `invert` true iken (varsayılan) anahtar renge UZAK pikseller
 * blob sayılır — yani yeşil perdenin önündeki nesne.
 */
export function scoreChroma(
  rgba: Uint8ClampedArray,
  out: ScoreBuf,
  key: readonly [number, number, number],
  space: KeySpace,
  invert: boolean,
): void {
  if (space === 'rgb') {
    const inv = 1 / (Math.sqrt(3) * 255)
    for (let i = 0, j = 0; j < out.length; i += 4, j++) {
      const dr = rgba[i]! - key[0]
      const dg = rgba[i + 1]! - key[1]
      const db = rgba[i + 2]! - key[2]
      const d = Math.sqrt(dr * dr + dg * dg + db * db) * inv
      out[j] = (invert ? d : 1 - d) * 255
    }
    return
  }
  const [kh, ks, kv] = rgbToHsv(key[0], key[1], key[2])
  for (let i = 0, j = 0; j < out.length; i += 4, j++) {
    const [ph, ps, pv] = rgbToHsv(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!)
    let dh = Math.abs(ph - kh)
    if (dh > 180) dh = 360 - dh
    // Doygunluk düşükken renk tonu güvenilmez; ağırlığını azalt.
    const hueWeight = Math.min(ps, ks)
    const dhn = (dh / 180) * hueWeight
    const ds = Math.abs(ps - ks)
    const dv = Math.abs(pv - kv)
    const d = Math.min(1, Math.sqrt(dhn * dhn * 1.6 + ds * ds * 0.7 + dv * dv * 0.35))
    out[j] = (invert ? d : 1 - d) * 255
  }
}

/**
 * Kare farkı skoru. `acc` hareket birikimidir: acc = max(diff, acc * decay).
 * decay 0 iken klasik anlık fark.
 */
export function scoreDiff(
  gray: Uint8ClampedArray,
  prev: Uint8ClampedArray,
  acc: Float32Array,
  out: ScoreBuf,
  decay: number,
): void {
  for (let i = 0; i < out.length; i++) {
    const d = Math.abs(gray[i]! - prev[i]!)
    const a = Math.max(d, acc[i]! * decay)
    acc[i] = a
    out[i] = a
  }
}

/**
 * Arka plan çıkarma skoru: |gray − model|. Model çalışan ortalamadır;
 * `learningRate` 0 iken (Freeze Background) model sabit kalır.
 */
export function scoreBackground(
  gray: Uint8ClampedArray,
  model: Float32Array,
  out: ScoreBuf,
  learningRate: number,
): void {
  for (let i = 0; i < out.length; i++) {
    const g = gray[i]!
    const m = model[i]!
    out[i] = Math.abs(g - m)
    if (learningRate > 0) model[i] = m + (g - m) * learningRate
  }
}

/**
 * Ortak eşikleme. `low` verilirse histerezis uygulanır: low..high arasındaki
 * pikseller yalnızca high üstü bir piksele 8-komşulukla bağlıysa korunur.
 */
export function applyThreshold(
  score: ScoreBuf,
  out: Uint8ClampedArray,
  high: number,
  low: number | null,
  w: number,
  h: number,
  stack: Int32Array,
): void {
  const n = w * h
  if (low === null || low >= high) {
    for (let i = 0; i < n; i++) out[i] = score[i]! >= high ? 255 : 0
    return
  }
  let sp = 0
  for (let i = 0; i < n; i++) {
    if (score[i]! >= high) {
      out[i] = 255
      if (sp < stack.length) stack[sp++] = i
    } else {
      out[i] = score[i]! >= low ? 1 : 0 // 1 = zayıf aday
    }
  }
  while (sp > 0) {
    const i = stack[--sp]!
    const x = i % w
    const y = (i / w) | 0
    for (let dy = -1; dy <= 1; dy++) {
      const ny = y + dy
      if (ny < 0 || ny >= h) continue
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx
        if (nx < 0 || nx >= w) continue
        const ni = ny * w + nx
        if (out[ni] === 1) {
          out[ni] = 255
          if (sp < stack.length) stack[sp++] = ni
        }
      }
    }
  }
  for (let i = 0; i < n; i++) if (out[i] === 1) out[i] = 0
}

export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const d = max - min
  let hue = 0
  if (d !== 0) {
    if (max === rn) hue = 60 * (((gn - bn) / d) % 6)
    else if (max === gn) hue = 60 * ((bn - rn) / d + 2)
    else hue = 60 * ((rn - gn) / d + 4)
    if (hue < 0) hue += 360
  }
  return [hue, max === 0 ? 0 : d / max, max]
}
