/**
 * Küçük GIF89a kodlayıcı (bağımlılıksız).
 *
 * · Palet: median-cut ile 256 renge indirgeme (birkaç kareden örneklenir)
 * · Eşleme: 5-bit kuantalanmış RGB anahtarlı önbellek + en yakın renk araması
 * · Sıkıştırma: değişken kod boyutlu LZW (GIF spesifikasyonu)
 *
 * GIF yalnızca 256 renk taşıdığı için gradyanlarda bantlanma olur; makine
 * görüşü estetiği (düz renk overlay + koyu zemin) bu sınıra iyi uyar.
 */

interface Box {
  pixels: number[] // paketlenmiş rgb (r<<16|g<<8|b)
  rMin: number
  rMax: number
  gMin: number
  gMax: number
  bMin: number
  bMax: number
}

function makeBox(pixels: number[]): Box {
  let rMin = 255
  let rMax = 0
  let gMin = 255
  let gMax = 0
  let bMin = 255
  let bMax = 0
  for (const p of pixels) {
    const r = (p >> 16) & 255
    const g = (p >> 8) & 255
    const b = p & 255
    if (r < rMin) rMin = r
    if (r > rMax) rMax = r
    if (g < gMin) gMin = g
    if (g > gMax) gMax = g
    if (b < bMin) bMin = b
    if (b > bMax) bMax = b
  }
  return { pixels, rMin, rMax, gMin, gMax, bMin, bMax }
}

/** Median-cut renk indirgeme. */
export function buildPalette(samples: number[], maxColors = 256): Uint8Array {
  if (samples.length === 0) return new Uint8Array(maxColors * 3)
  let boxes: Box[] = [makeBox(samples)]
  while (boxes.length < maxColors) {
    // en geniş kenarlı kutuyu böl
    let target = -1
    let best = -1
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i]!
      if (b.pixels.length < 2) continue
      const span = Math.max(b.rMax - b.rMin, b.gMax - b.gMin, b.bMax - b.bMin)
      if (span > best) {
        best = span
        target = i
      }
    }
    if (target < 0 || best <= 0) break
    const box = boxes[target]!
    const rSpan = box.rMax - box.rMin
    const gSpan = box.gMax - box.gMin
    const bSpan = box.bMax - box.bMin
    const shift = rSpan >= gSpan && rSpan >= bSpan ? 16 : gSpan >= bSpan ? 8 : 0
    box.pixels.sort((a, b) => ((a >> shift) & 255) - ((b >> shift) & 255))
    const mid = box.pixels.length >> 1
    boxes.splice(target, 1, makeBox(box.pixels.slice(0, mid)), makeBox(box.pixels.slice(mid)))
  }

  const palette = new Uint8Array(maxColors * 3)
  boxes = boxes.slice(0, maxColors)
  boxes.forEach((box, i) => {
    let r = 0
    let g = 0
    let b = 0
    for (const p of box.pixels) {
      r += (p >> 16) & 255
      g += (p >> 8) & 255
      b += p & 255
    }
    const n = Math.max(1, box.pixels.length)
    palette[i * 3] = Math.round(r / n)
    palette[i * 3 + 1] = Math.round(g / n)
    palette[i * 3 + 2] = Math.round(b / n)
  })
  return palette
}

export function samplePixels(rgba: Uint8ClampedArray, stride = 7, out: number[] = []): number[] {
  for (let i = 0; i < rgba.length; i += 4 * stride) {
    out.push((rgba[i]! << 16) | (rgba[i + 1]! << 8) | rgba[i + 2]!)
  }
  return out
}

/** RGBA kareyi palet indekslerine çevirir (önbellekli en yakın renk). */
export function mapToPalette(
  rgba: Uint8ClampedArray,
  palette: Uint8Array,
  colors: number,
  cache: Map<number, number>,
): Uint8Array {
  const out = new Uint8Array(rgba.length / 4)
  for (let i = 0, j = 0; j < out.length; i += 4, j++) {
    const r = rgba[i]!
    const g = rgba[i + 1]!
    const b = rgba[i + 2]!
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)
    const hit = cache.get(key)
    if (hit !== undefined) {
      out[j] = hit
      continue
    }
    let bestIndex = 0
    let bestDist = Infinity
    for (let c = 0; c < colors; c++) {
      const dr = r - palette[c * 3]!
      const dg = g - palette[c * 3 + 1]!
      const db = b - palette[c * 3 + 2]!
      const dist = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11
      if (dist < bestDist) {
        bestDist = dist
        bestIndex = c
      }
    }
    cache.set(key, bestIndex)
    out[j] = bestIndex
  }
  return out
}

/** Büyüyen bayt tamponu. */
class ByteWriter {
  private buf = new Uint8Array(1 << 16)
  private len = 0
  byte(v: number): void {
    this.ensure(1)
    this.buf[this.len++] = v & 255
  }
  short(v: number): void {
    this.byte(v)
    this.byte(v >> 8)
  }
  bytes(arr: Uint8Array | number[]): void {
    this.ensure(arr.length)
    this.buf.set(arr as Uint8Array, this.len)
    this.len += arr.length
  }
  ascii(s: string): void {
    for (let i = 0; i < s.length; i++) this.byte(s.charCodeAt(i))
  }
  private ensure(n: number): void {
    if (this.len + n <= this.buf.length) return
    let size = this.buf.length * 2
    while (size < this.len + n) size *= 2
    const next = new Uint8Array(size)
    next.set(this.buf.subarray(0, this.len))
    this.buf = next
  }
  result(): Uint8Array {
    return this.buf.slice(0, this.len)
  }
}

/** GIF LZW (değişken kod boyutu, 255 baytlık alt bloklar). */
function lzwEncode(indices: Uint8Array, minCodeSize: number, out: ByteWriter): void {
  const clearCode = 1 << minCodeSize
  const eoiCode = clearCode + 1
  let codeSize = minCodeSize + 1
  let nextCode = eoiCode + 1
  let dict = new Map<number, number>()

  const block: number[] = []
  let bitBuffer = 0
  let bitCount = 0

  const flushBlock = (force: boolean) => {
    while (block.length >= 255 || (force && block.length > 0)) {
      const take = Math.min(255, block.length)
      out.byte(take)
      out.bytes(block.splice(0, take))
      if (!force && block.length < 255) break
    }
  }
  const emit = (code: number) => {
    bitBuffer |= code << bitCount
    bitCount += codeSize
    while (bitCount >= 8) {
      block.push(bitBuffer & 255)
      bitBuffer >>= 8
      bitCount -= 8
      if (block.length >= 255) flushBlock(false)
    }
  }

  out.byte(minCodeSize)
  emit(clearCode)

  let prefix = indices.length > 0 ? indices[0]! : 0
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i]!
    const key = (prefix << 8) | k
    const found = dict.get(key)
    if (found !== undefined) {
      prefix = found
      continue
    }
    emit(prefix)
    dict.set(key, nextCode)
    nextCode++
    if (nextCode > (1 << codeSize) && codeSize < 12) {
      codeSize++
    } else if (nextCode >= 4096) {
      emit(clearCode)
      dict = new Map()
      nextCode = eoiCode + 1
      codeSize = minCodeSize + 1
    }
    prefix = k
  }
  if (indices.length > 0) emit(prefix)
  emit(eoiCode)
  if (bitCount > 0) {
    block.push(bitBuffer & 255)
    if (block.length >= 255) flushBlock(false)
  }
  flushBlock(true)
  out.byte(0) // blok sonu
}

export interface GifFrame {
  indices: Uint8Array
  delayCs: number
}

export function encodeGif(width: number, height: number, palette: Uint8Array, frames: GifFrame[]): Uint8Array {
  const w = new ByteWriter()
  w.ascii('GIF89a')
  w.short(width)
  w.short(height)
  w.byte(0xf7) // global palet var, 256 renk
  w.byte(0)
  w.byte(0)
  w.bytes(palette.subarray(0, 768))

  // Netscape döngü uzantısı (sonsuz)
  w.byte(0x21)
  w.byte(0xff)
  w.byte(11)
  w.ascii('NETSCAPE2.0')
  w.byte(3)
  w.byte(1)
  w.short(0)
  w.byte(0)

  for (const frame of frames) {
    w.byte(0x21) // grafik kontrol uzantısı
    w.byte(0xf9)
    w.byte(4)
    w.byte(0x04) // disposal: önceki kareyi koru
    w.short(frame.delayCs)
    w.byte(0)
    w.byte(0)

    w.byte(0x2c) // görüntü tanımlayıcı
    w.short(0)
    w.short(0)
    w.short(width)
    w.short(height)
    w.byte(0)

    lzwEncode(frame.indices, 8, w)
  }

  w.byte(0x3b) // dosya sonu
  return w.result()
}
