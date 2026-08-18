import { Pipeline } from '../cv/pipeline'
import { FrameGrabber, detectionSize } from '../media/frameGrabber'
import type { FrameResult } from '../cv/types'
import type { Params } from '../store/paramSchema'
import { needsMask, type WorkerRequest, type WorkerResponse } from './protocol'

/**
 * Detector — CV pipeline'ına tek giriş noktası. İki arka uç:
 *
 *  · worker  (varsayılan): ImageBitmap transferi + OffscreenCanvas ile worker'da
 *  · local   (yedek): Worker/OffscreenCanvas yoksa ana thread'de
 *
 * Önizleme için `request()` "en yenisi kazanır" politikası uygular: worker
 * meşgulken gelen kareler ATILIR, en son istek kuyrukta bekler. Böylece ağır
 * ayarlarda kuyruk şişmez ve önizleme gerçek zamanla senkron kalır.
 *
 * Export için `detect()` her kareyi bekleyerek işler (kare kaybı olmaz).
 */
export class Detector {
  private worker: Worker | null = null
  private local: Pipeline | null = null
  private grabber: FrameGrabber | null = null
  private nextId = 1
  private pending = new Map<number, { resolve: (r: FrameResult) => void; reject: (e: Error) => void }>()
  private busy = false
  private queued: (() => void) | null = null
  private disposed = false
  private workerErrors = 0

  /** Son tamamlanan sonuç (önizleme çizimi bunu kullanır). */
  latest: FrameResult | null = null
  /** Worker'da geçen süre (ms) — performans göstergesi. */
  lastMs = 0
  readonly usesWorker: boolean

  constructor(preferWorker = true) {
    const canUseWorker =
      preferWorker &&
      typeof Worker !== 'undefined' &&
      typeof OffscreenCanvas !== 'undefined' &&
      typeof createImageBitmap === 'function'

    this.usesWorker = canUseWorker
    if (canUseWorker) {
      this.worker = new Worker(new URL('./cv.worker.ts', import.meta.url), { type: 'module' })
      this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => this.onMessage(e.data)
      this.worker.onerror = () => this.fallbackToLocal()
    }
  }

  private onMessage(msg: WorkerResponse) {
    const entry = this.pending.get(msg.id)
    this.pending.delete(msg.id)
    if (msg.type === 'result') {
      this.lastMs = msg.msWorker
      this.latest = msg.result
      entry?.resolve(msg.result)
    } else if (msg.type === 'error') {
      // Worker hatası bekleyen isteği ASLA askıda bırakmamalı: reddet ve
      // sonraki karelerde yerel pipeline'a düş.
      this.workerErrors++
      if (this.workerErrors >= 3) this.fallbackToLocal()
      entry?.reject(new Error(msg.message))
    }
    this.busy = false
    const next = this.queued
    this.queued = null
    next?.()
  }

  /** Worker kullanılamaz hâle gelirse ana thread'e geç (uygulama çalışmaya devam eder). */
  private fallbackToLocal(): void {
    const worker = this.worker
    this.worker = null
    worker?.terminate()
    for (const entry of this.pending.values()) entry.reject(new Error('worker unavailable'))
    this.pending.clear()
    this.busy = false
  }

  /**
   * Önizleme yolu — sonucu beklemez. Worker meşgulse istek "en yeni" olarak
   * saklanır, öncekinin yerini alır.
   */
  request(
    source: HTMLVideoElement,
    frameIndex: number,
    time: number,
    p: Params,
    fps: number,
    maskPreview: boolean,
    onResult: (r: FrameResult) => void,
  ): void {
    if (this.disposed) return
    const run = () => {
      void this.detect(source, frameIndex, time, p, fps, maskPreview)
        .then(onResult)
        .catch(() => {
          // Worker hatası: yerel pipeline'a düşüldüyse bir sonraki istek çalışır.
        })
    }
    if (!this.worker) {
      run()
      return
    }
    if (this.busy) {
      this.queued = run
      return
    }
    run()
  }

  /** Export yolu — sonucu bekler. */
  async detect(
    source: HTMLVideoElement,
    frameIndex: number,
    time: number,
    p: Params,
    fps: number,
    maskPreview: boolean,
  ): Promise<FrameResult> {
    const d = detectionSize(source.videoWidth, source.videoHeight, p.detectionScale)

    if (!this.worker) {
      const pipeline = (this.local ??= new Pipeline())
      const grabber = (this.grabber ??= new FrameGrabber())
      const img = grabber.grab(source, d.w, d.h)
      const t0 = performance.now()
      const result = pipeline.process(img.data, d.w, d.h, frameIndex, time, p, d.scale, fps)
      this.lastMs = performance.now() - t0
      // Maske iç buffer'a referans verir; render aynı kare içinde tükettiği için
      // kopyalamaya gerek yok — ama sonucu saklarsak kopyalamak gerekir.
      this.latest = result
      return result
    }

    // GPU'da ölçekleyerek bitmap üret → worker'a transfer et.
    const bitmap = await createImageBitmap(source, {
      resizeWidth: d.w,
      resizeHeight: d.h,
      resizeQuality: 'low',
    })
    const id = this.nextId++
    const req: WorkerRequest = {
      type: 'process',
      id,
      bitmap,
      width: d.w,
      height: d.h,
      frameIndex,
      time,
      params: p,
      scale: d.scale,
      fps,
      needMask: needsMask(p, maskPreview),
    }
    this.busy = true
    return new Promise<FrameResult>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      try {
        this.worker!.postMessage(req, [bitmap])
      } catch (err) {
        this.pending.delete(id)
        this.busy = false
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    })
  }

  reset(): void {
    this.latest = null
    if (this.worker) this.worker.postMessage({ type: 'reset', id: this.nextId++ } satisfies WorkerRequest)
    else this.local?.reset()
  }

  freezeBackground(): void {
    if (this.worker) this.worker.postMessage({ type: 'freezeBackground', id: this.nextId++ } satisfies WorkerRequest)
    else this.local?.freezeBackground()
  }

  dispose(): void {
    this.disposed = true
    this.worker?.terminate()
    this.worker = null
    this.grabber?.dispose()
    this.pending.clear()
  }
}
