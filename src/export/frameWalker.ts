import { Detector } from '../worker/detector'
import { renderFrame } from '../render/renderer'
import type { FrameResult } from '../cv/types'
import type { ExportJob } from './types'
import { resolveFps, resolveSize } from './types'

/**
 * FrameWalker — export'un kalbi.
 *
 * Gerçek zamanlı ekran kaydı YAPMAZ. Kendi <video> öğesini kurar (önizlemeyi
 * bozmaz), her çıktı karesi için kaynağın ilgili karesinin MERKEZİNE seek eder,
 * CV + render'ı çalıştırır ve kareyi geri verir. Yavaş makinede de kare kaybı
 * olmaz; çıktı bit birebir aynıdır.
 *
 * requestAnimationFrame kullanılmaz: kullanıcı sekme değiştirse bile export
 * devam eder (rAF arka planda durur).
 */
export class FrameWalker {
  private video: HTMLVideoElement
  private detector: Detector
  private renderCanvas: HTMLCanvasElement
  private renderCtx: CanvasRenderingContext2D
  private outCanvas: HTMLCanvasElement
  private outCtx: CanvasRenderingContext2D
  readonly width: number
  readonly height: number
  readonly fps: number
  readonly totalFrames: number
  private job: ExportJob

  constructor(job: ExportJob) {
    this.job = job
    const size = resolveSize(job)
    this.width = size.width
    this.height = size.height
    this.fps = resolveFps(job)
    const duration = Math.max(0, job.endTime - job.startTime)
    this.totalFrames = Math.max(1, Math.round(duration * this.fps))

    const ss = job.settings.supersample
    this.renderCanvas = document.createElement('canvas')
    this.renderCanvas.width = this.width * ss
    this.renderCanvas.height = this.height * ss
    const rctx = this.renderCanvas.getContext('2d', { alpha: true })
    if (!rctx) throw new Error('2d context unavailable')
    this.renderCtx = rctx

    this.outCanvas = document.createElement('canvas')
    this.outCanvas.width = this.width
    this.outCanvas.height = this.height
    const octx = this.outCanvas.getContext('2d', { alpha: true })
    if (!octx) throw new Error('2d context unavailable')
    this.outCtx = octx

    this.video = document.createElement('video')
    this.video.muted = true
    this.video.playsInline = true
    this.video.preload = 'auto'
    this.video.src = job.url
    // Bazı tarayıcılarda DOM dışındaki video öğesi kare sağlamaz.
    this.video.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none'
    document.body.appendChild(this.video)

    this.detector = new Detector()
  }

  async ready(): Promise<void> {
    if (this.video.readyState >= 2) return
    await new Promise<void>((resolve, reject) => {
      const ok = () => {
        cleanup()
        resolve()
      }
      const fail = () => {
        cleanup()
        reject(new Error('export video load failed'))
      }
      const cleanup = () => {
        this.video.removeEventListener('loadeddata', ok)
        this.video.removeEventListener('error', fail)
      }
      this.video.addEventListener('loadeddata', ok)
      this.video.addEventListener('error', fail)
    })
  }

  /** i. çıktı karesini üretir ve çizilmiş canvas'ı döndürür. */
  async frame(i: number): Promise<{ canvas: HTMLCanvasElement; result: FrameResult; time: number }> {
    const t = this.job.startTime + i / this.fps
    // Kaynak karesinin merkezine seek et → yuvarlama komşu kareye kaymaz.
    const srcIndex = Math.max(0, Math.round(t * this.job.sourceFps - 0.5))
    const seekTo = (srcIndex + 0.5) / this.job.sourceFps
    await this.seek(Math.min(seekTo, Math.max(0, this.video.duration - 1e-3)))

    const p = this.job.params
    const result = await this.detector.detect(this.video, srcIndex, t, p, this.job.sourceFps, false)

    const ss = this.job.settings.supersample
    const view = {
      width: this.width * ss,
      height: this.height * ss,
      time: t,
      frameIndex: srcIndex,
      fps: this.fps,
      scaleX: (this.width * ss) / result.detectionWidth,
      scaleY: (this.height * ss) / result.detectionHeight,
      overlayOnly: this.job.settings.overlayOnly || this.job.settings.alpha,
    }
    renderFrame(this.renderCtx, this.video, result, p, view)

    if (ss === 1) return { canvas: this.renderCanvas, result, time: t }
    this.outCtx.setTransform(1, 0, 0, 1, 0, 0)
    this.outCtx.clearRect(0, 0, this.width, this.height)
    this.outCtx.imageSmoothingEnabled = true
    this.outCtx.imageSmoothingQuality = 'high'
    this.outCtx.drawImage(this.renderCanvas, 0, 0, this.width, this.height)
    return { canvas: this.outCanvas, result, time: t }
  }

  private seek(time: number): Promise<void> {
    const v = this.video
    if (Math.abs(v.currentTime - time) < 1e-6 && v.readyState >= 2) return Promise.resolve()
    return new Promise((resolve) => {
      const done = () => {
        v.removeEventListener('seeked', done)
        resolve()
      }
      v.addEventListener('seeked', done)
      v.currentTime = time
    })
  }

  dispose(): void {
    this.detector.dispose()
    this.video.removeAttribute('src')
    this.video.load()
    this.video.remove()
  }
}
