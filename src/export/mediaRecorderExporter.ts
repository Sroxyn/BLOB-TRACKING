import { Detector } from '../worker/detector'
import { renderFrame } from '../render/renderer'
import { collectTelemetry, telemetryFiles } from './telemetry'
import type { FrameResult } from '../cv/types'
import type { ExportHooks, ExportJob, ExportOutput } from './types'
import { outputFileName, resolveFps, resolveSize } from './types'

/**
 * MediaRecorder yedeği — WebCodecs yokken (eski Safari vb.).
 *
 * GERÇEK ZAMANLI kayıttır: video normal hızda oynar ve canvas akışı kaydedilir.
 * Makine yetişemezse kare düşer; bu yüzden yalnızca yedek yoldur ve kullanıcıya
 * uyarı gösterilir.
 */
export function mediaRecorderAvailable(): boolean {
  return typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function'
}

export async function exportWithMediaRecorder(job: ExportJob, hooks: ExportHooks): Promise<ExportOutput> {
  const { width, height } = resolveSize(job)
  const fps = resolveFps(job)
  const warnings = [
    'WebCodecs bulunamadı: gerçek zamanlı kayıt kullanıldı. Kare kaybı olabilir, süre birebir olmayabilir.',
  ]

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { alpha: true })
  if (!ctx) throw new Error('2d context unavailable')

  const video = document.createElement('video')
  video.src = job.url
  video.muted = !job.settings.includeAudio
  video.playsInline = true
  video.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0'
  document.body.appendChild(video)
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve()
    video.onerror = () => reject(new Error('video load failed'))
  })

  const detector = new Detector()
  const telemetry = collectTelemetry(job, width, height, fps)
  const stream = canvas.captureStream(fps)

  if (job.settings.includeAudio) {
    const capture = (video as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream
    const media = capture ? capture.call(video) : null
    for (const track of media?.getAudioTracks() ?? []) stream.addTrack(track)
    if (!media?.getAudioTracks().length) warnings.push('Ses parçası yakalanamadı; kayıt sessiz.')
  }

  const mimeCandidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ]
  const mimeType = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? ''
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: job.settings.bitrateMbps * 1e6 } : undefined)
  const chunks: BlobPart[] = []
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data)
  }

  let latest: FrameResult | null = null
  let frameCount = 0
  const totalFrames = Math.max(1, Math.round((job.endTime - job.startTime) * fps))

  const draw = () => {
    const result = latest
    const view = {
      width,
      height,
      time: video.currentTime,
      frameIndex: Math.round(video.currentTime * job.sourceFps),
      fps,
      scaleX: result ? width / result.detectionWidth : 1,
      scaleY: result ? height / result.detectionHeight : 1,
      overlayOnly: job.settings.overlayOnly,
    }
    renderFrame(ctx, video, result, job.params, view)
    frameCount++
    hooks.onProgress({ frame: Math.min(frameCount, totalFrames), totalFrames, etaMs: null, stage: 'video' })
  }

  video.currentTime = job.startTime
  await new Promise<void>((resolve) => {
    video.onseeked = () => resolve()
  })

  const stopPromise = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || 'video/webm' }))
  })

  recorder.start(100)
  await video.play()

  await new Promise<void>((resolve) => {
    const tick = () => {
      if (hooks.signal.aborted || video.currentTime >= job.endTime || video.ended) {
        resolve()
        return
      }
      detector
        .detect(video, Math.round(video.currentTime * job.sourceFps), video.currentTime, job.params, job.sourceFps, false)
        .then((r) => {
          latest = r
          telemetry.push(r, frameCount, video.currentTime)
        })
        .catch(() => undefined)
      draw()
      setTimeout(tick, 1000 / fps)
    }
    tick()
  })

  video.pause()
  recorder.stop()
  const blob = await stopPromise
  detector.dispose()
  video.remove()

  if (hooks.signal.aborted) throw new DOMException('aborted', 'AbortError')

  return {
    blob,
    fileName: outputFileName(job, 'webm'),
    mimeType: blob.type || 'video/webm',
    extras: telemetryFiles(job, telemetry),
    warnings,
  }
}
