/// <reference lib="webworker" />
import { Pipeline } from '../cv/pipeline'
import type { ProcessRequest, WorkerRequest, WorkerResponse } from './protocol'

/**
 * CV worker — pipeline burada çalışır, ana thread yalnızca çizim yapar.
 *
 * Kare, ana thread'de `createImageBitmap(video, {resizeWidth…})` ile zaten
 * detection çözünürlüğüne indirilmiş olarak gelir (GPU'da ölçekleme) ve
 * transferable olduğu için kopyalanmaz. Pahalı olan `getImageData` de burada,
 * worker'ın kendi OffscreenCanvas'ında yapılır.
 */

const pipeline = new Pipeline()
let canvas: OffscreenCanvas | null = null
let ctx: OffscreenCanvasRenderingContext2D | null = null

function surface(w: number, h: number): OffscreenCanvasRenderingContext2D {
  if (!canvas || canvas.width !== w || canvas.height !== h) {
    canvas = new OffscreenCanvas(w, h)
    ctx = canvas.getContext('2d', { willReadFrequently: true })
  }
  if (!ctx) throw new Error('OffscreenCanvas 2d context unavailable')
  return ctx
}

function handleProcess(req: ProcessRequest): void {
  const t0 = performance.now()
  const c = surface(req.width, req.height)
  c.drawImage(req.bitmap, 0, 0, req.width, req.height)
  req.bitmap.close()
  const img = c.getImageData(0, 0, req.width, req.height)

  const result = pipeline.process(
    img.data,
    req.width,
    req.height,
    req.frameIndex,
    req.time,
    req.params,
    req.scale,
    req.fps,
  )

  // Maske pipeline'ın yeniden kullanılan iç buffer'ıdır; transfer etmeden ÖNCE
  // kopyalanmalı, aksi hâlde havuzdaki buffer koparılır (detached).
  const transfer: Transferable[] = []
  let mask = null
  if (req.needMask && result.mask) {
    const copy = result.mask.data.slice()
    mask = { data: copy, width: result.mask.width, height: result.mask.height }
    transfer.push(copy.buffer)
  }

  const response: WorkerResponse = {
    type: 'result',
    id: req.id,
    result: { ...result, mask },
    msWorker: performance.now() - t0,
  }
  ;(self as unknown as Worker).postMessage(response, transfer)
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const req = e.data
  try {
    switch (req.type) {
      case 'process':
        handleProcess(req)
        break
      case 'reset':
        pipeline.reset()
        ;(self as unknown as Worker).postMessage({ type: 'ack', id: req.id } satisfies WorkerResponse)
        break
      case 'freezeBackground':
        pipeline.freezeBackground()
        ;(self as unknown as Worker).postMessage({ type: 'ack', id: req.id } satisfies WorkerResponse)
        break
    }
  } catch (err) {
    const response: WorkerResponse = {
      type: 'error',
      id: req.id,
      message: err instanceof Error ? err.message : String(err),
    }
    ;(self as unknown as Worker).postMessage(response)
  }
}
