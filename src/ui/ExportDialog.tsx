import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Download, X } from 'lucide-react'
import { useExportStore } from '../store/useExportStore'
import { useMediaStore } from '../store/useMediaStore'
import { useParamsStore } from '../store/useParamsStore'
import { downloadBlob, runExport } from '../export'
import { webcodecsAvailable } from '../export/webcodecsExporter'
import { resolveFps, resolveSize, type ExportJob, type ExportOutput, type ExportProgress } from '../export/types'
import { SelectField, Slider, Toggle } from './controls/primitives'
import { formatTimecode } from '../store/useMediaStore'

const FORMAT_LABELS: Record<string, string> = {
  mp4: 'MP4 · H.264',
  'webm-vp9': 'WEBM · VP9',
  'webm-vp8': 'WEBM · VP8',
  png: 'PNG SEQUENCE · ZIP',
  gif: 'GIF',
}

type Phase = 'idle' | 'running' | 'done' | 'error'

export function ExportDialog() {
  const open = useExportStore((s) => s.open)
  const setOpen = useExportStore((s) => s.setOpen)
  const settings = useExportStore((s) => s.settings)
  const patch = useExportStore((s) => s.patch)
  const params = useParamsStore((s) => s.params)
  const media = useMediaStore()

  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState<ExportProgress | null>(null)
  const [output, setOutput] = useState<ExportOutput | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const previewUrlRef = useRef<string | null>(null)

  const job: ExportJob | null = useMemo(() => {
    if (media.status !== 'ready' || !media.url) return null
    const start = settings.useRange ? media.inPoint : 0
    const end = settings.useRange ? media.outPoint : media.duration
    return {
      settings,
      params,
      url: media.url,
      sourceWidth: media.width,
      sourceHeight: media.height,
      sourceFps: media.fps,
      startTime: start,
      endTime: Math.max(start + 1 / media.fps, end),
      fileName: media.fileName ?? 'video',
    }
  }, [media, params, settings])

  const size = job ? resolveSize(job) : null
  const fps = job ? resolveFps(job) : 0
  const frameCount = job ? Math.max(1, Math.round((job.endTime - job.startTime) * fps)) : 0

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    }
  }, [])

  const start = useCallback(async () => {
    if (!job) return
    setPhase('running')
    setError(null)
    setOutput(null)
    setProgress({ frame: 0, totalFrames: frameCount, etaMs: null, stage: 'video' })
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const result = await runExport(job, { onProgress: setProgress, signal: controller.signal })
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = URL.createObjectURL(result.blob)
      setOutput(result)
      setPhase('done')
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        setPhase('idle')
        setProgress(null)
        return
      }
      setError(e instanceof Error ? e.message : String(e))
      setPhase('error')
    } finally {
      abortRef.current = null
    }
  }, [frameCount, job])

  if (!open) return null

  const isVideo = settings.format === 'mp4' || settings.format.startsWith('webm')
  const pct = progress && progress.totalFrames > 0 ? (progress.frame / progress.totalFrames) * 100 : 0

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-0/80 p-4">
      <div className="flex max-h-full w-[420px] flex-col overflow-hidden rounded-[3px] border border-line bg-ink-1 shadow-2xl">
        <header className="flex items-center gap-2 border-b border-line px-3 py-2">
          <span className="text-[10px] tracking-[0.2em] text-fg">EXPORT</span>
          <button
            type="button"
            onClick={() => {
              abortRef.current?.abort()
              setOpen(false)
            }}
            className="ml-auto text-dim hover:text-fg"
            title="Kapat (Esc)"
          >
            <X size={13} />
          </button>
        </header>

        <div className="no-scrollbar flex flex-col gap-[3px] overflow-y-auto px-3 py-3">
          <SelectField
            label="Format"
            value={settings.format}
            options={['mp4', 'webm-vp9', 'webm-vp8', 'png', 'gif']}
            onChange={(v) => patch({ format: v as typeof settings.format })}
          />
          <SelectField
            label="Resolution"
            value={settings.resolution}
            options={['original', '1080p', '720p', '540p', 'custom']}
            onChange={(v) => patch({ resolution: v as typeof settings.resolution })}
          />
          {settings.resolution === 'custom' && (
            <>
              <Slider
                label="Width"
                value={settings.customWidth}
                min={64}
                max={3840}
                step={2}
                integer
                unit="px"
                onChange={(v) => patch({ customWidth: v })}
                onReset={() => patch({ customWidth: 1080 })}
              />
              <Slider
                label="Height"
                value={settings.customHeight}
                min={64}
                max={3840}
                step={2}
                integer
                unit="px"
                onChange={(v) => patch({ customHeight: v })}
                onReset={() => patch({ customHeight: 1920 })}
              />
            </>
          )}
          <SelectField
            label="FPS"
            value={String(settings.fps)}
            options={['source', '24', '30', '60']}
            onChange={(v) => patch({ fps: v === 'source' ? 'source' : (Number(v) as 24 | 30 | 60) })}
          />
          <Toggle
            label="2× Supersample"
            value={settings.supersample === 2}
            onChange={(v) => patch({ supersample: v ? 2 : 1 })}
          />
          {isVideo && (
            <Slider
              label="Bitrate"
              value={settings.bitrateMbps}
              min={1}
              max={80}
              step={1}
              unit="Mbps"
              onChange={(v) => patch({ bitrateMbps: v })}
              onReset={() => patch({ bitrateMbps: 12 })}
            />
          )}
          <Toggle label="Yalnızca in/out aralığı" value={settings.useRange} onChange={(v) => patch({ useRange: v })} />
          {isVideo && <Toggle label="Sesi taşı" value={settings.includeAudio} onChange={(v) => patch({ includeAudio: v })} />}
          <Toggle label="Yalnızca overlay" value={settings.overlayOnly} onChange={(v) => patch({ overlayOnly: v })} />
          {settings.format === 'webm-vp9' && (
            <Toggle label="Alfa kanalı (şeffaf)" value={settings.alpha} onChange={(v) => patch({ alpha: v })} />
          )}
          <SelectField
            label="Telemetry"
            value={settings.telemetry}
            options={['none', 'json', 'csv', 'both']}
            onChange={(v) => patch({ telemetry: v as typeof settings.telemetry })}
          />

          <div className="mt-2 rounded-[2px] bg-ink-2 px-2 py-2 text-[10px] leading-relaxed text-dim">
            {job && size ? (
              <>
                <div className="tabnum text-fg-soft">
                  {FORMAT_LABELS[settings.format]} · {size.width}×{size.height} · {fps} fps
                </div>
                <div className="tabnum">
                  {frameCount} kare · {formatTimecode(job.startTime, media.fps)} → {formatTimecode(job.endTime, media.fps)}
                </div>
                {!webcodecsAvailable() && isVideo && (
                  <div className="mt-1 text-amber-400">
                    WebCodecs yok — gerçek zamanlı kayda düşülecek, kare kaybı olabilir.
                  </div>
                )}
              </>
            ) : (
              <span>Önce bir video yükle.</span>
            )}
          </div>
        </div>

        <footer className="border-t border-line px-3 py-3">
          {phase === 'running' && progress && (
            <div className="mb-2">
              <div className="mb-1 flex items-center justify-between text-[10px] text-dim">
                <span className="tabnum">
                  {stageLabel(progress.stage)} · kare {progress.frame} / {progress.totalFrames}
                </span>
                <span className="tabnum">{progress.etaMs !== null ? `~${formatEta(progress.etaMs)} kaldı` : '—'}</span>
              </div>
              <div className="h-[3px] w-full overflow-hidden rounded-full bg-ink-3">
                <div className="h-full bg-[var(--accent-ui)] transition-[width]" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}

          {phase === 'error' && <div className="mb-2 text-[10px] text-red-400">{error}</div>}

          {phase === 'done' && output && (
            <div className="mb-2">
              {output.warnings.map((w) => (
                <div key={w} className="mb-1 text-[10px] text-amber-400">
                  {w}
                </div>
              ))}
              {previewUrlRef.current && (settings.format === 'mp4' || settings.format.startsWith('webm')) && (
                <video
                  src={previewUrlRef.current}
                  controls
                  loop
                  className="mb-2 max-h-[220px] w-full rounded-[2px] bg-black"
                />
              )}
              {previewUrlRef.current && settings.format === 'gif' && (
                <img src={previewUrlRef.current} alt="" className="mb-2 max-h-[220px] w-full object-contain" />
              )}
              <div className="tabnum text-[10px] text-dim">
                {output.fileName} · {(output.blob.size / 1_048_576).toFixed(1)} MB
              </div>
            </div>
          )}

          <div className="flex gap-2">
            {phase === 'running' ? (
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                className="h-7 flex-1 rounded-[2px] bg-ink-3 text-[10px] tracking-[0.14em] text-fg-soft hover:bg-ink-4"
              >
                İPTAL
              </button>
            ) : phase === 'done' && output ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    downloadBlob(output.blob, output.fileName)
                    for (const extra of output.extras) downloadBlob(extra.blob, extra.fileName)
                  }}
                  className="flex h-7 flex-1 items-center justify-center gap-1 rounded-[2px] bg-[var(--accent-ui)]/20 text-[10px] tracking-[0.14em] text-[var(--accent-ui)] hover:bg-[var(--accent-ui)]/30"
                >
                  <Download size={12} /> İNDİR{output.extras.length > 0 ? ` (+${output.extras.length})` : ''}
                </button>
                <button
                  type="button"
                  onClick={() => setPhase('idle')}
                  className="h-7 rounded-[2px] bg-ink-3 px-3 text-[10px] tracking-[0.14em] text-fg-soft hover:bg-ink-4"
                >
                  YENİDEN
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={!job}
                onClick={() => void start()}
                className="h-7 flex-1 rounded-[2px] bg-[var(--accent-ui)]/20 text-[10px] tracking-[0.14em] text-[var(--accent-ui)] hover:bg-[var(--accent-ui)]/30 disabled:opacity-30"
              >
                EXPORT
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  )
}

function stageLabel(stage: ExportProgress['stage']): string {
  switch (stage) {
    case 'audio':
      return 'ses'
    case 'muxing':
      return 'birleştiriliyor'
    case 'zip':
      return 'sıkıştırılıyor'
    case 'palette':
      return 'palet'
    default:
      return 'video'
  }
}

function formatEta(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s} sn`
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
