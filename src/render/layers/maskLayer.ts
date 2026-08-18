import type { Params } from '../../store/paramSchema'
import type { FrameResult } from '../../cv/types'
import type { ViewInfo } from '../types'
import { hexToRgb } from '../colors'
import { getScratch } from '../scratch'

/**
 * Maske overlay — ikili maskeyi tint rengiyle, seçilen blend modunda üste basar.
 * Maske detection çözünürlüğündedir; nearest-neighbor ile büyütülür (yumuşatma
 * kapalı) — makine görüşü estetiğinde keskin kenar istenir.
 */
export function drawMaskOverlay(
  ctx: CanvasRenderingContext2D,
  result: FrameResult | null,
  p: Params,
  view: ViewInfo,
): void {
  if (!p.maskOverlay || !result?.mask || p.maskOpacity <= 0) return
  const mask = result.mask
  const s = getScratch('maskOverlay', mask.width, mask.height)
  const img = s.createImageData(mask.width, mask.height)
  const [r, g, b] = hexToRgb(p.maskColor)
  const src = mask.data
  const dst = img.data
  for (let i = 0, j = 0; i < src.length; i++, j += 4) {
    if (src[i]) {
      dst[j] = r
      dst[j + 1] = g
      dst[j + 2] = b
      dst[j + 3] = 255
    } else {
      dst[j + 3] = 0
    }
  }
  s.putImageData(img, 0, 0)

  ctx.save()
  ctx.globalAlpha = p.maskOpacity
  ctx.globalCompositeOperation = p.maskBlend as GlobalCompositeOperation
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(s.canvas, 0, 0, mask.width, mask.height, 0, 0, view.width, view.height)
  ctx.restore()
}
