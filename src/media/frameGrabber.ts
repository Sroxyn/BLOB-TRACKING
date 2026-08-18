/**
 * FrameGrabber — kaynak kareyi detection çözünürlüğüne indirip RGBA piksel
 * verisini çıkarır. drawImage ölçeklemesi GPU'da yapıldığı için downscale
 * bedavaya yakındır; pahalı olan getImageData'dır, bu yüzden canvas
 * `willReadFrequently` ile açılır ve yeniden kullanılır.
 *
 * CV katmanının DOM'a değen tek noktası burasıdır.
 */
export class FrameGrabber {
  private ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null
  private w = 0
  private h = 0

  /** @returns detection çözünürlüğünde RGBA + ölçek bilgisi */
  grab(source: CanvasImageSource, targetW: number, targetH: number): ImageData {
    if (!this.ctx || this.w !== targetW || this.h !== targetH) {
      this.w = targetW
      this.h = targetH
      if (typeof OffscreenCanvas !== 'undefined') {
        const c = new OffscreenCanvas(targetW, targetH)
        // ctx.canvas üzerinden erişilebilir; ayrı alan tutmaya gerek yok
        this.ctx = c.getContext('2d', { willReadFrequently: true })
      } else {
        const c = document.createElement('canvas')
        c.width = targetW
        c.height = targetH
        this.ctx = c.getContext('2d', { willReadFrequently: true })
      }
    }
    const ctx = this.ctx
    if (!ctx) throw new Error('2d context unavailable')
    ctx.drawImage(source, 0, 0, targetW, targetH)
    return ctx.getImageData(0, 0, targetW, targetH)
  }

  dispose(): void {
    this.ctx = null
  }
}

/** detectionScale'i geçerli bir kare boyutuna çevirir (en az 32 px kenar). */
export function detectionSize(
  width: number,
  height: number,
  scale: number,
): { w: number; h: number; scale: number } {
  const s = Math.max(0.05, Math.min(1, scale))
  const w = Math.max(32, Math.round(width * s))
  const h = Math.max(32, Math.round(height * s))
  return { w, h, scale: w / width }
}
