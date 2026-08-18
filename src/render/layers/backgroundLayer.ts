import type { Params } from '../../store/paramSchema'
import type { FrameResult } from '../../cv/types'
import { getScratch } from '../scratch'
import { sobel, toGray } from '../../cv/preprocess'
import type { ViewInfo } from '../types'

/**
 * Arka plan katmanı. Kaynak kareyi seçilen moda göre basar.
 * Maske tabanlı modlar (mask / maskColored / edges) FrameResult gerektirir;
 * maske yoksa sessizce siyaha düşer.
 */

export function drawBackground(
  ctx: CanvasRenderingContext2D,
  video: CanvasImageSource | null,
  result: FrameResult | null,
  p: Params,
  view: ViewInfo,
): void {
  const { width: w, height: h } = view
  const mode = p.backgroundMode

  const fillFlat = (color: string) => {
    ctx.fillStyle = color
    ctx.fillRect(0, 0, w, h)
  }

  switch (mode) {
    case 'black':
      fillFlat('#000000')
      return
    case 'white':
      fillFlat('#ffffff')
      return
    case 'color':
      fillFlat(p.backgroundColor)
      return
    case 'mask':
    case 'maskColored':
      drawMask(ctx, result, p, view, mode === 'maskColored')
      return
    case 'edges':
      drawEdges(ctx, video, result, view)
      return
    default:
      break
  }

  if (!video) {
    fillFlat('#000000')
    return
  }

  ctx.save()
  const filters: string[] = []
  if (p.backgroundBlur > 0) filters.push(`blur(${p.backgroundBlur}px)`)
  if (p.backgroundSaturation !== 1) filters.push(`saturate(${p.backgroundSaturation})`)
  if (p.backgroundContrast !== 1) filters.push(`contrast(${p.backgroundContrast})`)
  if (filters.length) ctx.filter = filters.join(' ')
  if (mode === 'dimmed') ctx.globalAlpha = p.backgroundOpacity

  if (mode === 'pixelate') {
    const size = Math.max(2, p.pixelateSize)
    const sw = Math.max(1, Math.round(w / size))
    const sh = Math.max(1, Math.round(h / size))
    const s = getScratch('bgPixelate', sw, sh)
    s.imageSmoothingEnabled = true
    s.drawImage(video, 0, 0, sw, sh)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(s.canvas, 0, 0, sw, sh, 0, 0, w, h)
    ctx.imageSmoothingEnabled = true
  } else {
    if (mode === 'dimmed') {
      ctx.filter = 'none'
      ctx.globalAlpha = 1
      ctx.fillStyle = '#000000'
      ctx.fillRect(0, 0, w, h)
      if (filters.length) ctx.filter = filters.join(' ')
      ctx.globalAlpha = p.backgroundOpacity
    }
    ctx.drawImage(video, 0, 0, w, h)
  }
  ctx.restore()

  if (mode === 'posterize') applyPosterize(ctx, w, h, p.posterizeLevels)
}

function drawMask(
  ctx: CanvasRenderingContext2D,
  result: FrameResult | null,
  p: Params,
  view: ViewInfo,
  colored: boolean,
): void {
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, view.width, view.height)
  const mask = result?.mask
  if (!mask) return
  const s = getScratch('bgMask', mask.width, mask.height)
  const img = s.createImageData(mask.width, mask.height)
  const rgb = colored ? hexToRgbTuple(p.maskColor) : ([255, 255, 255] as const)
  const src = mask.data
  const dst = img.data
  for (let i = 0, j = 0; i < src.length; i++, j += 4) {
    const on = src[i] ? 255 : 0
    dst[j] = on ? rgb[0] : 0
    dst[j + 1] = on ? rgb[1] : 0
    dst[j + 2] = on ? rgb[2] : 0
    dst[j + 3] = 255
  }
  s.putImageData(img, 0, 0)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(s.canvas, 0, 0, mask.width, mask.height, 0, 0, view.width, view.height)
  ctx.imageSmoothingEnabled = true
}

/**
 * Kenar görüntüsü — kaynak kareyi detection çözünürlüğünde Sobel'den geçirir.
 * CV katmanının saf fonksiyonları burada yeniden kullanılır.
 */
function drawEdges(
  ctx: CanvasRenderingContext2D,
  video: CanvasImageSource | null,
  result: FrameResult | null,
  view: ViewInfo,
): void {
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, view.width, view.height)
  if (!video) return
  const dw = result?.detectionWidth || Math.max(64, Math.round(view.width * 0.35))
  const dh = result?.detectionHeight || Math.max(64, Math.round(view.height * 0.35))
  const s = getScratch('bgEdge', dw, dh, true)
  s.drawImage(video, 0, 0, dw, dh)
  const img = s.getImageData(0, 0, dw, dh)
  const gray = new Uint8ClampedArray(dw * dh)
  const edge = new Uint8ClampedArray(dw * dh)
  toGray(img.data, gray)
  sobel(gray, edge, dw, dh)
  const d = img.data
  for (let i = 0, j = 0; i < edge.length; i++, j += 4) {
    const v = edge[i]!
    d[j] = v
    d[j + 1] = v
    d[j + 2] = v
    d[j + 3] = 255
  }
  s.putImageData(img, 0, 0)
  ctx.drawImage(s.canvas, 0, 0, dw, dh, 0, 0, view.width, view.height)
}

function applyPosterize(ctx: CanvasRenderingContext2D, w: number, h: number, levels: number): void {
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  const step = 255 / Math.max(1, levels - 1)
  for (let i = 0; i < d.length; i += 4) {
    d[i] = Math.round(d[i]! / step) * step
    d[i + 1] = Math.round(d[i + 1]! / step) * step
    d[i + 2] = Math.round(d[i + 2]! / step) * step
  }
  ctx.putImageData(img, 0, 0)
}

export function hexToRgbTuple(hex: string): readonly [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m || !m[1]) return [255, 255, 255]
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
