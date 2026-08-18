import { zip } from 'fflate'
import { FrameWalker } from './frameWalker'
import { collectTelemetry, telemetryFiles } from './telemetry'
import type { ExportHooks, ExportJob, ExportOutput } from './types'
import { outputFileName } from './types'

/**
 * PNG sequence — her kare ayrı PNG, tek ZIP içinde.
 * PNG zaten sıkıştırılmış olduğu için ZIP "store" (level 0) ile paketlenir;
 * hem hızlı hem de dosya boyutu neredeyse aynı kalır.
 */
export async function exportPngSequence(job: ExportJob, hooks: ExportHooks): Promise<ExportOutput> {
  const walker = new FrameWalker(job)
  await walker.ready()
  const telemetry = collectTelemetry(job, walker.width, walker.height, walker.fps)
  const files: Record<string, [Uint8Array, { level: 0 }]> = {}
  const started = performance.now()
  const pad = String(walker.totalFrames).length + 1

  try {
    for (let i = 0; i < walker.totalFrames; i++) {
      if (hooks.signal.aborted) throw new DOMException('aborted', 'AbortError')
      const { canvas, result, time } = await walker.frame(i)
      telemetry.push(result, i, time)
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('PNG kodlanamadı')
      const bytes = new Uint8Array(await blob.arrayBuffer())
      files[`frame_${String(i).padStart(pad, '0')}.png`] = [bytes, { level: 0 }]

      const elapsed = performance.now() - started
      const eta = i > 2 ? (elapsed / (i + 1)) * (walker.totalFrames - i - 1) : null
      hooks.onProgress({ frame: i + 1, totalFrames: walker.totalFrames, etaMs: eta, stage: 'video' })
    }

    hooks.onProgress({ frame: walker.totalFrames, totalFrames: walker.totalFrames, etaMs: 0, stage: 'zip' })
    const zipped = await new Promise<Uint8Array>((resolve, reject) => {
      zip(files, { level: 0 }, (err, data) => (err ? reject(err) : resolve(data)))
    })

    return {
      blob: new Blob([zipped as unknown as BlobPart], { type: 'application/zip' }),
      fileName: outputFileName(job, 'zip'),
      mimeType: 'application/zip',
      extras: telemetryFiles(job, telemetry),
      warnings: [],
    }
  } finally {
    walker.dispose()
  }
}
