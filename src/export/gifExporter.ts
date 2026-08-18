import { FrameWalker } from './frameWalker'
import { buildPalette, encodeGif, mapToPalette, samplePixels, type GifFrame } from './gif'
import { collectTelemetry, telemetryFiles } from './telemetry'
import type { ExportHooks, ExportJob, ExportOutput } from './types'
import { outputFileName } from './types'

/**
 * GIF export — iki geçiş:
 *   1. kareler çizilir, piksel örnekleri toplanır → ortak (global) palet
 *   2. kareler palete eşlenir ve LZW ile sıkıştırılır
 * Kareler bellekte RGBA olarak tutulmaz; birinci geçişte saklanan yalnızca
 * örneklerdir, ikinci geçişte kareler yeniden üretilir.
 */
export async function exportGif(job: ExportJob, hooks: ExportHooks): Promise<ExportOutput> {
  const walker = new FrameWalker(job)
  await walker.ready()
  const telemetry = collectTelemetry(job, walker.width, walker.height, walker.fps)
  const warnings: string[] = []
  const total = walker.totalFrames
  const delayCs = Math.max(2, Math.round(100 / walker.fps))
  if (walker.width * walker.height > 1280 * 720) {
    warnings.push('GIF büyük çözünürlükte çok yer kaplar; 720p veya altını öneririm.')
  }

  try {
    /* 1 · palet için örnekleme */
    const samples: number[] = []
    const sampleEvery = Math.max(1, Math.floor(total / 12))
    const scratch = document.createElement('canvas')
    scratch.width = walker.width
    scratch.height = walker.height
    const sctx = scratch.getContext('2d', { willReadFrequently: true })
    if (!sctx) throw new Error('2d context unavailable')

    for (let i = 0; i < total; i += sampleEvery) {
      if (hooks.signal.aborted) throw new DOMException('aborted', 'AbortError')
      const { canvas } = await walker.frame(i)
      sctx.clearRect(0, 0, walker.width, walker.height)
      sctx.drawImage(canvas, 0, 0, walker.width, walker.height)
      samplePixels(sctx.getImageData(0, 0, walker.width, walker.height).data, 11, samples)
      hooks.onProgress({ frame: i, totalFrames: total, etaMs: null, stage: 'palette' })
    }
    const palette = buildPalette(samples, 256)

    /* 2 · kareleri palete eşle */
    const cache = new Map<number, number>()
    const frames: GifFrame[] = []
    const started = performance.now()
    for (let i = 0; i < total; i++) {
      if (hooks.signal.aborted) throw new DOMException('aborted', 'AbortError')
      const { canvas, result, time } = await walker.frame(i)
      telemetry.push(result, i, time)
      sctx.clearRect(0, 0, walker.width, walker.height)
      sctx.drawImage(canvas, 0, 0, walker.width, walker.height)
      const rgba = sctx.getImageData(0, 0, walker.width, walker.height).data
      frames.push({ indices: mapToPalette(rgba, palette, 256, cache), delayCs })
      const elapsed = performance.now() - started
      hooks.onProgress({
        frame: i + 1,
        totalFrames: total,
        etaMs: i > 2 ? (elapsed / (i + 1)) * (total - i - 1) : null,
        stage: 'video',
      })
    }

    hooks.onProgress({ frame: total, totalFrames: total, etaMs: 0, stage: 'muxing' })
    const bytes = encodeGif(walker.width, walker.height, palette, frames)

    return {
      blob: new Blob([bytes as unknown as BlobPart], { type: 'image/gif' }),
      fileName: outputFileName(job, 'gif'),
      mimeType: 'image/gif',
      extras: telemetryFiles(job, telemetry),
      warnings,
    }
  } finally {
    walker.dispose()
  }
}
