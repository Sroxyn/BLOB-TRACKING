import { exportWithWebCodecs, webcodecsAvailable } from './webcodecsExporter'
import { exportWithMediaRecorder, mediaRecorderAvailable } from './mediaRecorderExporter'
import { exportPngSequence } from './pngSequence'
import { exportGif } from './gifExporter'
import type { ExportHooks, ExportJob, ExportOutput } from './types'

/**
 * Export dağıtıcısı. Ana yol WebCodecs (kare-doğru, offline); yoksa video
 * formatları için MediaRecorder yedeğine düşer.
 */
export async function runExport(job: ExportJob, hooks: ExportHooks): Promise<ExportOutput> {
  switch (job.settings.format) {
    case 'png':
      return exportPngSequence(job, hooks)
    case 'gif':
      return exportGif(job, hooks)
    default:
      if (webcodecsAvailable()) return exportWithWebCodecs(job, hooks)
      if (mediaRecorderAvailable()) return exportWithMediaRecorder(job, hooks)
      throw new Error('Bu tarayıcı video export desteklemiyor (WebCodecs ve MediaRecorder yok).')
  }
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export type { ExportJob, ExportOutput, ExportHooks } from './types'
