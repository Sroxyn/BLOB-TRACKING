import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4Target } from 'mp4-muxer'
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmTarget } from 'webm-muxer'
import { FrameWalker } from './frameWalker'
import { decodeAudio, encodeAudioRange } from './audio'
import { collectTelemetry, telemetryFiles } from './telemetry'
import type { ExportHooks, ExportJob, ExportOutput } from './types'
import { outputFileName } from './types'

/**
 * WebCodecs offline export — ana yol.
 *
 * Kare kare: seek → CV → render → VideoFrame → VideoEncoder → muxer.
 * Gerçek zamanlı kayıt olmadığı için makine hızından bağımsız, kare-doğru
 * ve deterministik çıktı verir.
 */

const H264_CANDIDATES = ['avc1.640028', 'avc1.4d0028', 'avc1.42002a', 'avc1.42001f']

async function pickVideoConfig(
  format: ExportJob['settings']['format'],
  width: number,
  height: number,
  bitrate: number,
  fps: number,
  alpha: boolean,
): Promise<VideoEncoderConfig | null> {
  const candidates =
    format === 'mp4' ? H264_CANDIDATES : format === 'webm-vp9' ? ['vp09.00.10.08'] : ['vp8']
  // Alfa istendiyse önce onunla dene; desteklenmiyorsa opak yapılandırmaya düş
  // (export'u tamamen reddetmek yerine uyarı ile devam etmek daha yararlı).
  for (const wantAlpha of alpha ? [true, false] : [false]) {
    for (const codec of candidates) {
      const config: VideoEncoderConfig = {
        codec,
        width,
        height,
        bitrate,
        framerate: fps,
        ...(wantAlpha ? { alpha: 'keep' as const } : {}),
      }
      const support = await VideoEncoder.isConfigSupported(config).catch(() => null)
      if (support?.supported) return config
    }
  }
  return null
}

export function webcodecsAvailable(): boolean {
  return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined'
}

export async function exportWithWebCodecs(job: ExportJob, hooks: ExportHooks): Promise<ExportOutput> {
  const warnings: string[] = []
  const walker = new FrameWalker(job)
  await walker.ready()

  const { width, height, fps, totalFrames } = walker
  const bitrate = Math.round(job.settings.bitrateMbps * 1_000_000)
  const isMp4 = job.settings.format === 'mp4'
  const alpha = job.settings.alpha && job.settings.format === 'webm-vp9'

  const videoConfig = await pickVideoConfig(job.settings.format, width, height, bitrate, fps, alpha)
  if (!videoConfig) {
    walker.dispose()
    throw new Error('Bu format/çözünürlük bu tarayıcıda desteklenmiyor.')
  }
  const alphaKept = videoConfig.alpha === 'keep'
  if (alpha && !alphaKept) warnings.push('Alfa kanalı bu tarayıcıda desteklenmiyor; opak kodlandı.')

  /* ── ses ── */
  let audio: Awaited<ReturnType<typeof decodeAudio>> = null
  if (job.settings.includeAudio) {
    hooks.onProgress({ frame: 0, totalFrames, etaMs: null, stage: 'audio' })
    audio = await decodeAudio(job.url)
    if (!audio) warnings.push('Kaynakta ses bulunamadı veya çözülemedi; video sessiz.')
  }
  const audioCodec = isMp4 ? ('aac' as const) : ('opus' as const)

  /* ── muxer ── */
  const mp4Target = isMp4 ? new Mp4Target() : null
  const webmTarget = isMp4 ? null : new WebmTarget()
  const mp4Muxer = mp4Target
    ? new Mp4Muxer({
        target: mp4Target,
        video: { codec: 'avc', width, height, frameRate: fps },
        ...(audio ? { audio: { codec: 'aac', numberOfChannels: Math.min(2, audio.channels.length), sampleRate: audio.sampleRate } } : {}),
        fastStart: 'in-memory',
      })
    : null
  const webmMuxer = webmTarget
    ? new WebmMuxer({
        target: webmTarget,
        video: {
          codec: job.settings.format === 'webm-vp9' ? 'V_VP9' : 'V_VP8',
          width,
          height,
          frameRate: fps,
          alpha: alphaKept,
        },
        ...(audio ? { audio: { codec: 'A_OPUS', numberOfChannels: Math.min(2, audio.channels.length), sampleRate: audio.sampleRate } } : {}),
      })
    : null

  const addVideoChunk = (chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata) => {
    if (mp4Muxer) mp4Muxer.addVideoChunk(chunk, meta)
    else webmMuxer?.addVideoChunk(chunk, meta)
  }
  const addAudioChunk = (chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata) => {
    if (mp4Muxer) mp4Muxer.addAudioChunk(chunk, meta)
    else webmMuxer?.addAudioChunk(chunk, meta)
  }

  /* ── video kodlama ── */
  let encoderError: Error | null = null
  const encoder = new VideoEncoder({
    output: (chunk, meta) => addVideoChunk(chunk, meta),
    error: (e) => {
      encoderError = e instanceof Error ? e : new Error(String(e))
    },
  })
  encoder.configure(videoConfig)

  const telemetry = collectTelemetry(job, width, height, fps)
  const started = performance.now()
  const keyInterval = Math.max(1, Math.round(fps * 2))

  try {
    for (let i = 0; i < totalFrames; i++) {
      if (hooks.signal.aborted) throw new DOMException('aborted', 'AbortError')
      if (encoderError) throw encoderError

      const { canvas, result, time } = await walker.frame(i)
      telemetry.push(result, i, time)

      const frame = new VideoFrame(canvas, {
        timestamp: Math.round((i / fps) * 1_000_000),
        duration: Math.round(1_000_000 / fps),
        ...(alphaKept ? { alpha: 'keep' as const } : {}),
      })
      encoder.encode(frame, { keyFrame: i % keyInterval === 0 })
      frame.close()

      // Geri basınç: kuyruk şişerse kodlayıcıya yetişme fırsatı ver.
      while (encoder.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 0))

      const elapsed = performance.now() - started
      const eta = i > 2 ? (elapsed / (i + 1)) * (totalFrames - i - 1) : null
      hooks.onProgress({ frame: i + 1, totalFrames, etaMs: eta, stage: 'video' })
    }

    await encoder.flush()
    encoder.close()

    /* ── ses kodlama ── */
    if (audio) {
      hooks.onProgress({ frame: totalFrames, totalFrames, etaMs: 0, stage: 'audio' })
      const ok = await encodeAudioRange(audio, {
        codec: audioCodec,
        bitrate: 128_000,
        startTime: job.startTime,
        endTime: job.endTime,
        onChunk: (chunk, meta) => addAudioChunk(chunk, meta),
      }).catch(() => null)
      if (!ok) warnings.push('Ses kodlanamadı; video sessiz olarak yazıldı.')
    }

    hooks.onProgress({ frame: totalFrames, totalFrames, etaMs: 0, stage: 'muxing' })
    if (mp4Muxer) mp4Muxer.finalize()
    else webmMuxer?.finalize()

    const buffer = (mp4Target?.buffer ?? webmTarget?.buffer) as ArrayBuffer
    const mimeType = isMp4 ? 'video/mp4' : 'video/webm'
    const blob = new Blob([buffer], { type: mimeType })

    return {
      blob,
      fileName: outputFileName(job, isMp4 ? 'mp4' : 'webm'),
      mimeType,
      extras: telemetryFiles(job, telemetry),
      warnings,
    }
  } finally {
    if (encoder.state !== 'closed') encoder.close()
    walker.dispose()
  }
}
