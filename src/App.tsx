import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, Download, FolderOpen, ShieldCheck, SlidersHorizontal, X } from 'lucide-react'
import { ControlPanel } from './ui/ControlPanel'
import { ExportDialog } from './ui/ExportDialog'
import { PresetPicker } from './ui/PresetPicker'
import { Viewport } from './ui/Viewport'
import { Timeline } from './ui/Timeline'
import { useKeyboard } from './ui/useKeyboard'
import { useMediaStore } from './store/useMediaStore'
import { useParamsStore } from './store/useParamsStore'
import { useExportStore } from './store/useExportStore'
import { videoEngine } from './media/VideoEngine'
import { readableAccent } from './ui/theme'

const ACCEPT = 'video/mp4,video/quicktime,video/webm,video/x-matroska,video/*'

export default function App() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const accentColor = useParamsStore((s) => s.params.accentColor)
  const load = useMediaStore((s) => s.load)
  const unload = useMediaStore((s) => s.unload)
  const setStatus = useMediaStore((s) => s.setStatus)
  const status = useMediaStore((s) => s.status)
  const fileName = useMediaStore((s) => s.fileName)
  const width = useMediaStore((s) => s.width)
  const height = useMediaStore((s) => s.height)
  const error = useMediaStore((s) => s.error)

  useKeyboard()

  // UI vurgu rengi parametreyi izler, okunabilirlik için parlaklığı sınırlanır.
  useEffect(() => {
    document.documentElement.style.setProperty('--accent', accentColor)
    document.documentElement.style.setProperty('--accent-ui', readableAccent(accentColor))
  }, [accentColor])

  // Kaynak fps ölçümü oynatma sırasında kilitlenir; store'a yansıt.
  useEffect(() => {
    let last = videoEngine.fps
    return videoEngine.subscribe(() => {
      if (videoEngine.fps !== last) {
        last = videoEngine.fps
        const media = useMediaStore.getState()
        const wasFull = Math.abs(media.outPoint - media.duration) < 1e-6
        useMediaStore.setState({ fps: last })
        if (wasFull) media.setRange(media.inPoint, media.duration)
      }
    })
  }, [])

  const openFile = useCallback(
    async (file: File) => {
      const prev = useMediaStore.getState().url
      if (prev) URL.revokeObjectURL(prev)
      videoEngine.pause()
      setStatus('loading')
      const url = URL.createObjectURL(file)
      try {
        const meta = await videoEngine.load(url)
        if (!meta.width || !meta.height) throw new Error('no video track')
        load({
          url,
          fileName: file.name,
          width: meta.width,
          height: meta.height,
          duration: Number.isFinite(meta.duration) ? meta.duration : 0,
          fps: videoEngine.fps,
          hasAudio: hasAudioTrack(videoEngine.el),
        })
        await videoEngine.seek(0)
        videoEngine.emitNow()
      } catch {
        URL.revokeObjectURL(url)
        setStatus('error', `"${file.name}" tarayıcıda açılamadı — kodek desteklenmiyor olabilir.`)
      }
    },
    [load, setStatus],
  )

  return (
    <div
      className="flex h-full flex-col bg-ink-1"
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        const file = e.dataTransfer.files[0]
        if (file) void openFile(file)
      }}
    >
      <header className="flex h-9 shrink-0 items-center gap-3 border-b border-line px-3">
        <span className="text-[11px] tracking-[0.22em] text-fg">
          BLOB<span className="text-[var(--accent-ui)]">·</span>TRACK
        </span>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          title={status === 'ready' ? 'Başka bir video seç' : 'Video seç'}
          className="flex h-6 items-center gap-1.5 rounded-[2px] border border-line bg-ink-2 px-2 text-[9px] tracking-[0.14em] text-fg-soft hover:border-[var(--accent-ui)]/40 hover:bg-ink-3 hover:text-fg"
        >
          <FolderOpen size={11} />
          {status === 'ready' ? 'VİDEO DEĞİŞTİR' : 'VİDEO SEÇ'}
        </button>
        {fileName && <span className="truncate text-[10px] text-dim">{fileName}</span>}
        {width > 0 && (
          <span className="tabnum text-[10px] text-dim">
            {width}×{height}
          </span>
        )}
        {status === 'ready' && (
          <button
            type="button"
            title="Kaynağı kaldır"
            onClick={() => {
              videoEngine.unload()
              unload()
            }}
            className="text-dim hover:text-red-400"
          >
            <X size={11} />
          </button>
        )}
        <span className="ml-auto flex items-center gap-1 text-[9px] tracking-[0.14em] text-dim">
          <ShieldCheck size={11} />
          LOCAL ONLY · UPLOAD YOK
        </span>
        <button
          type="button"
          disabled={status !== 'ready'}
          onClick={() => useExportStore.getState().setOpen(true)}
          title="Export (E)"
          className="flex h-6 items-center gap-1 rounded-[2px] bg-[var(--accent-ui)]/15 px-2 text-[9px] tracking-[0.16em] text-[var(--accent-ui)] hover:bg-[var(--accent-ui)]/25 disabled:opacity-30"
        >
          <Download size={11} /> EXPORT
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col">
          <Viewport onPickFile={() => inputRef.current?.click()} />
          {status === 'error' && (
            <div className="shrink-0 border-t border-line bg-ink-1 px-3 py-2 text-[10px] text-red-400">{error}</div>
          )}
          <Timeline />
        </main>
        {/* Masaüstü: sabit sağ panel */}
        <div className="hidden w-[300px] shrink-0 md:block">
          <ControlPanel />
        </div>
      </div>

      {/* Mobil: alttan açılan çekmece */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 h-[64vh] border-t border-line transition-transform duration-150 md:hidden"
        style={{ transform: panelOpen ? 'translateY(0)' : 'translateY(100%)' }}
        aria-hidden={!panelOpen}
      >
        <ControlPanel />
      </div>
      <button
        type="button"
        onClick={() => setPanelOpen((v) => !v)}
        title="Kontrol paneli"
        className="fixed right-3 bottom-3 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-line bg-ink-2 text-fg-soft shadow-lg md:hidden"
      >
        {panelOpen ? <ChevronDown size={16} /> : <SlidersHorizontal size={15} />}
      </button>

      <ExportDialog />
      <PresetPicker />

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void openFile(file)
          e.target.value = ''
        }}
      />

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-ink-0/80">
          <div className="rounded-[3px] border border-dashed border-[var(--accent-ui)]/60 px-8 py-6 text-[11px] tracking-[0.18em] text-[var(--accent-ui)]">
            BIRAK
          </div>
        </div>
      )}
    </div>
  )
}

function hasAudioTrack(el: HTMLVideoElement): boolean {
  const v = el as HTMLVideoElement & {
    mozHasAudio?: boolean
    webkitAudioDecodedByteCount?: number
    audioTracks?: { length: number }
  }
  if (typeof v.audioTracks?.length === 'number') return v.audioTracks.length > 0
  if (typeof v.mozHasAudio === 'boolean') return v.mozHasAudio
  return (v.webkitAudioDecodedByteCount ?? 0) > 0
}
