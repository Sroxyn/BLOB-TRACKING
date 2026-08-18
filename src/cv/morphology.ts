/**
 * Morfoloji — kare yapı elemanı ayrıştırılabilir olduğu için erode/dilate
 * yatay + dikey iki geçişte yapılır (k×k yerine 2k işlem/piksel).
 *
 * open  = erode → dilate  (parazit noktaları siler)
 * close = dilate → erode  (delikleri doldurur)
 */

function minH(src: Uint8ClampedArray, dst: Uint8ClampedArray, w: number, h: number, r: number): void {
  for (let y = 0; y < h; y++) {
    const row = y * w
    for (let x = 0; x < w; x++) {
      let m = 255
      const x0 = Math.max(0, x - r)
      const x1 = Math.min(w - 1, x + r)
      for (let i = x0; i <= x1; i++) {
        const v = src[row + i]!
        if (v < m) m = v
        if (m === 0) break
      }
      dst[row + x] = m
    }
  }
}

function minV(src: Uint8ClampedArray, dst: Uint8ClampedArray, w: number, h: number, r: number): void {
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let m = 255
      const y0 = Math.max(0, y - r)
      const y1 = Math.min(h - 1, y + r)
      for (let i = y0; i <= y1; i++) {
        const v = src[i * w + x]!
        if (v < m) m = v
        if (m === 0) break
      }
      dst[y * w + x] = m
    }
  }
}

function maxH(src: Uint8ClampedArray, dst: Uint8ClampedArray, w: number, h: number, r: number): void {
  for (let y = 0; y < h; y++) {
    const row = y * w
    for (let x = 0; x < w; x++) {
      let m = 0
      const x0 = Math.max(0, x - r)
      const x1 = Math.min(w - 1, x + r)
      for (let i = x0; i <= x1; i++) {
        const v = src[row + i]!
        if (v > m) m = v
        if (m === 255) break
      }
      dst[row + x] = m
    }
  }
}

function maxV(src: Uint8ClampedArray, dst: Uint8ClampedArray, w: number, h: number, r: number): void {
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let m = 0
      const y0 = Math.max(0, y - r)
      const y1 = Math.min(h - 1, y + r)
      for (let i = y0; i <= y1; i++) {
        const v = src[i * w + x]!
        if (v > m) m = v
        if (m === 255) break
      }
      dst[y * w + x] = m
    }
  }
}

/** buf yerinde aşınır; tmp aynı boyutta çalışma alanı. */
export function erode(buf: Uint8ClampedArray, tmp: Uint8ClampedArray, w: number, h: number, k: number): void {
  const r = (k - 1) >> 1
  if (r < 1) return
  minH(buf, tmp, w, h, r)
  minV(tmp, buf, w, h, r)
}

export function dilate(buf: Uint8ClampedArray, tmp: Uint8ClampedArray, w: number, h: number, k: number): void {
  const r = (k - 1) >> 1
  if (r < 1) return
  maxH(buf, tmp, w, h, r)
  maxV(tmp, buf, w, h, r)
}

export function open(
  buf: Uint8ClampedArray,
  tmp: Uint8ClampedArray,
  w: number,
  h: number,
  k: number,
  iterations: number,
): void {
  for (let i = 0; i < iterations; i++) erode(buf, tmp, w, h, k)
  for (let i = 0; i < iterations; i++) dilate(buf, tmp, w, h, k)
}

export function close(
  buf: Uint8ClampedArray,
  tmp: Uint8ClampedArray,
  w: number,
  h: number,
  k: number,
  iterations: number,
): void {
  for (let i = 0; i < iterations; i++) dilate(buf, tmp, w, h, k)
  for (let i = 0; i < iterations; i++) erode(buf, tmp, w, h, k)
}
