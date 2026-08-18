import type { Params } from '../store/paramSchema'

export type ExportFormat = 'mp4' | 'webm-vp9' | 'webm-vp8' | 'png' | 'gif'
export type ExportResolution = 'original' | '1080p' | '720p' | '540p' | 'custom'
export type ExportFps = 'source' | 24 | 30 | 60
export type TelemetryFormat = 'none' | 'json' | 'csv' | 'both'

export interface ExportSettings {
  format: ExportFormat
  resolution: ExportResolution
  customWidth: number
  customHeight: number
  /** 2 = 2× supersample (aliasing'i yok eder) */
  supersample: 1 | 2
  fps: ExportFps
  bitrateMbps: number
  useRange: boolean
  includeAudio: boolean
  overlayOnly: boolean
  /** WebM VP9 + alpha — arka plan şeffaf */
  alpha: boolean
  telemetry: TelemetryFormat
}

export interface ExportJob {
  settings: ExportSettings
  params: Params
  /** Kaynak video URL'si (object URL) */
  url: string
  sourceWidth: number
  sourceHeight: number
  sourceFps: number
  startTime: number
  endTime: number
  fileName: string
}

export interface ExportProgress {
  frame: number
  totalFrames: number
  /** Kalan tahmini süre (ms), bilinmiyorsa null */
  etaMs: number | null
  stage: 'video' | 'audio' | 'muxing' | 'zip' | 'palette' | 'done'
}

export interface ExportOutput {
  blob: Blob
  fileName: string
  mimeType: string
  /** Yan çıktılar: telemetri dosyaları */
  extras: { blob: Blob; fileName: string }[]
  warnings: string[]
}

export interface ExportHooks {
  onProgress: (p: ExportProgress) => void
  signal: AbortSignal
}

export function resolveSize(job: ExportJob): { width: number; height: number } {
  const { settings: s, sourceWidth: sw, sourceHeight: sh } = job
  const aspect = sw / sh
  let w: number
  let h: number
  switch (s.resolution) {
    case '1080p':
      h = sh >= sw ? 1920 : 1080
      w = Math.round(h * aspect)
      break
    case '720p':
      h = sh >= sw ? 1280 : 720
      w = Math.round(h * aspect)
      break
    case '540p':
      h = sh >= sw ? 960 : 540
      w = Math.round(h * aspect)
      break
    case 'custom':
      w = s.customWidth
      h = s.customHeight
      break
    default:
      w = sw
      h = sh
  }
  // H.264 çift sayı gerektirir; diğer kodekler için de zararsız.
  return { width: Math.max(2, Math.round(w / 2) * 2), height: Math.max(2, Math.round(h / 2) * 2) }
}

export function resolveFps(job: ExportJob): number {
  return job.settings.fps === 'source' ? job.sourceFps : job.settings.fps
}

export function outputFileName(job: ExportJob, ext: string): string {
  const base = job.fileName.replace(/\.[^.]+$/, '') || 'blobtrack'
  return `${base}_blobtrack.${ext}`
}
