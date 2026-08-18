/**
 * Ön işleme — hepsi saf, DOM'suz, yerinde (in-place) veya verilen çıkışa yazar.
 *
 * · toGray: Rec.709 luma katsayıları (0.2126 R, 0.7152 G, 0.0722 B)
 * · boxBlur: ayrık (separable) kayan toplam kutu bulanıklığı; 3 geçiş Gauss'a
 *   yakınsar ve yarıçaptan bağımsız O(n) çalışır
 * · levels: brightness / contrast / gamma / invert tek bir 256'lık LUT'ta birleşir
 */

export function toGray(rgba: Uint8ClampedArray, out: Uint8ClampedArray): void {
  for (let i = 0, j = 0; j < out.length; i += 4, j++) {
    out[j] = (rgba[i]! * 0.2126 + rgba[i + 1]! * 0.7152 + rgba[i + 2]! * 0.0722) | 0
  }
}

/** Yatay kayan toplam. Kenarlarda kenar pikseli tekrar edilir (clamp). */
function blurH(src: Uint8ClampedArray, dst: Uint8ClampedArray, w: number, h: number, r: number): void {
  const win = r * 2 + 1
  for (let y = 0; y < h; y++) {
    const row = y * w
    let sum = src[row]! * (r + 1)
    for (let x = 0; x < r; x++) sum += src[row + Math.min(x, w - 1)]!
    for (let x = 0; x < w; x++) {
      const add = src[row + Math.min(x + r, w - 1)]!
      const sub = src[row + Math.max(x - r - 1, 0)]!
      sum += add - sub
      dst[row + x] = (sum / win) | 0
    }
  }
}

function blurV(src: Uint8ClampedArray, dst: Uint8ClampedArray, w: number, h: number, r: number): void {
  const win = r * 2 + 1
  for (let x = 0; x < w; x++) {
    let sum = src[x]! * (r + 1)
    for (let y = 0; y < r; y++) sum += src[Math.min(y, h - 1) * w + x]!
    for (let y = 0; y < h; y++) {
      const add = src[Math.min(y + r, h - 1) * w + x]!
      const sub = src[Math.max(y - r - 1, 0) * w + x]!
      sum += add - sub
      dst[y * w + x] = (sum / win) | 0
    }
  }
}

/**
 * 3 geçişli kutu bulanıklığı. `buf` yerinde bulanıklaşır, `tmp` aynı boyutta
 * bir çalışma alanıdır.
 */
export function boxBlur(
  buf: Uint8ClampedArray,
  tmp: Uint8ClampedArray,
  w: number,
  h: number,
  radius: number,
  passes = 3,
): void {
  const r = Math.round(radius)
  if (r < 1) return
  for (let i = 0; i < passes; i++) {
    blurH(buf, tmp, w, h, r)
    blurV(tmp, buf, w, h, r)
  }
}

/** brightness ∈ [-1,1] · contrast ∈ [-1,1] · gamma ∈ [0.2,3] */
export function buildLevelsLut(
  lut: Uint8ClampedArray,
  brightness: number,
  contrast: number,
  gamma: number,
  invert: boolean,
): void {
  const c = contrast <= 0 ? contrast + 1 : 1 + contrast * 3
  const invGamma = 1 / gamma
  for (let i = 0; i < 256; i++) {
    let v = i / 255
    v = (v - 0.5) * c + 0.5 + brightness
    v = v <= 0 ? 0 : v >= 1 ? 1 : Math.pow(v, invGamma)
    lut[i] = (invert ? 1 - v : v) * 255
  }
}

export function applyLut(buf: Uint8ClampedArray, lut: Uint8ClampedArray): void {
  for (let i = 0; i < buf.length; i++) buf[i] = lut[buf[i]!]!
}

/** Sobel gradyan büyüklüğü (0..255'e kırpılmış). */
export function sobel(src: Uint8ClampedArray, dst: Uint8ClampedArray, w: number, h: number): void {
  dst.fill(0)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const tl = src[i - w - 1]!, t = src[i - w]!, tr = src[i - w + 1]!
      const l = src[i - 1]!, r = src[i + 1]!
      const bl = src[i + w - 1]!, b = src[i + w]!, br = src[i + w + 1]!
      const gx = tl + 2 * l + bl - tr - 2 * r - br
      const gy = tl + 2 * t + tr - bl - 2 * b - br
      const mag = Math.sqrt(gx * gx + gy * gy)
      dst[i] = mag > 255 ? 255 : mag
    }
  }
}
