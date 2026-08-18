import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronFirst, ChevronLast, Pause, Play, Repeat, SkipBack, SkipForward } from 'lucide-react'
import { formatTimecode, useMediaStore } from '../store/useMediaStore'
import { videoEngine } from '../media/VideoEngine'
import { IconButton } from './ControlPanel'

/** Timeline + transport. Scrub, in/out işaretleme, kare kare gezinme. */
export function Timeline() {
  const trackRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<'play' | 'in' | 'out' | null>(null)

  const status = useMediaStore((s) => s.status)
  const duration = useMediaStore((s) => s.duration)
  const currentTime = useMediaStore((s) => s.currentTime)
  const inPoint = useMediaStore((s) => s.inPoint)
  const outPoint = useMediaStore((s) => s.outPoint)
  const loop = useMediaStore((s) => s.loop)
  const setLoop = useMediaStore((s) => s.setLoop)
  const setRange = useMediaStore((s) => s.setRange)
  const fps = useMediaStore((s) => s.fps)
  const fpsMeasured = useMediaStore((s) => s.fpsMeasured)
  const blobCount = useMediaStore((s) => s.blobCount)
  const msDetect = useMediaStore((s) => s.msDetect)
  const width = useMediaStore((s) => s.width)
  const height = useMediaStore((s) => s.height)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    const el = videoEngine.el
    const on = () => setPlaying(true)
    const off = () => setPlaying(false)
    el.addEventListener('play', on)
    el.addEventListener('pause', off)
    el.addEventListener('ended', off)
    return () => {
      el.removeEventListener('play', on)
      el.removeEventListener('pause', off)
      el.removeEventListener('ended', off)
    }
  }, [])

  useEffect(() => {
    videoEngine.setRange(inPoint, outPoint)
  }, [inPoint, outPoint])
  useEffect(() => {
    videoEngine.setLoop(loop)
  }, [loop])

  const timeAt = useCallback(
    (clientX: number) => {
      const el = trackRef.current
      if (!el || duration <= 0) return 0
      const r = el.getBoundingClientRect()
      const t = ((clientX - r.left) / r.width) * duration
      return Math.max(0, Math.min(duration, t))
    },
    [duration],
  )

  const ready = status === 'ready' && duration > 0
  const pct = (t: number) => (duration > 0 ? (t / duration) * 100 : 0)
  const frameIndex = Math.max(0, Math.round(currentTime * fps - 0.5))
  const totalFrames = Math.max(1, Math.round(duration * fps))

  return (
    <div className="shrink-0 border-t border-line bg-ink-1 px-3 py-2">
      <div className="flex items-center gap-2">
        <IconButton label="Oynat / Duraklat (Space)" onClick={() => void videoEngine.toggle()} disabled={!ready}>
          {playing ? <Pause size={13} /> : <Play size={13} />}
        </IconButton>
        <IconButton label="Önceki kare (←)" onClick={() => void videoEngine.step(-1)} disabled={!ready}>
          <SkipBack size={12} />
        </IconButton>
        <IconButton label="Sonraki kare (→)" onClick={() => void videoEngine.step(1)} disabled={!ready}>
          <SkipForward size={12} />
        </IconButton>
        <IconButton label="Döngü (L)" active={loop} onClick={() => setLoop(!loop)} disabled={!ready}>
          <Repeat size={12} />
        </IconButton>

        {/* ── scrub track ── */}
        <div
          ref={trackRef}
          className={`relative mx-1 h-6 flex-1 rounded-[2px] bg-ink-3 ${ready ? 'cursor-pointer' : 'opacity-40'}`}
          onPointerDown={(e) => {
            if (!ready) return
            e.currentTarget.setPointerCapture(e.pointerId)
            setDrag('play')
            void videoEngine.seek(timeAt(e.clientX))
          }}
          onPointerMove={(e) => {
            if (!drag || !e.currentTarget.hasPointerCapture(e.pointerId)) return
            const t = timeAt(e.clientX)
            if (drag === 'play') void videoEngine.seek(t)
            else if (drag === 'in') setRange(Math.min(t, outPoint - 1 / fps), outPoint)
            else setRange(inPoint, Math.max(t, inPoint + 1 / fps))
          }}
          onPointerUp={() => setDrag(null)}
        >
          {/* in/out aralığı */}
          <div
            className="pointer-events-none absolute inset-y-0 bg-[var(--accent-ui)]/10"
            style={{ left: `${pct(inPoint)}%`, width: `${Math.max(0, pct(outPoint) - pct(inPoint))}%` }}
          />
          {/* aralık dışı karartma */}
          <div className="pointer-events-none absolute inset-y-0 left-0 bg-ink-1/60" style={{ width: `${pct(inPoint)}%` }} />
          <div
            className="pointer-events-none absolute inset-y-0 right-0 bg-ink-1/60"
            style={{ width: `${Math.max(0, 100 - pct(outPoint))}%` }}
          />
          {/* playhead */}
          <div
            className="pointer-events-none absolute inset-y-0 w-px bg-[var(--accent-ui)]"
            style={{ left: `${pct(currentTime)}%` }}
          />
          {/* in/out tutamakları */}
          {ready && (
            <>
              <Handle side="in" left={pct(inPoint)} onGrab={() => setDrag('in')} />
              <Handle side="out" left={pct(outPoint)} onGrab={() => setDrag('out')} />
            </>
          )}
        </div>

        <IconButton
          label="In noktası (I)"
          onClick={() => setRange(Math.min(currentTime, outPoint - 1 / fps), outPoint)}
          disabled={!ready}
        >
          <ChevronFirst size={12} />
        </IconButton>
        <IconButton
          label="Out noktası (O)"
          onClick={() => setRange(inPoint, Math.max(currentTime, inPoint + 1 / fps))}
          disabled={!ready}
        >
          <ChevronLast size={12} />
        </IconButton>

        <span className="tabnum ml-1 w-[92px] text-right text-[11px] text-fg">
          {formatTimecode(currentTime, fps)}
        </span>
      </div>

      <div className="mt-1.5 flex items-center gap-4 pl-1 text-[9px] tracking-wide text-dim">
        <span className="tabnum">
          FRAME <span className="text-fg-soft">{frameIndex}</span>/{totalFrames}
        </span>
        <span className="tabnum">
          SRC <span className="text-fg-soft">{fps}</span> FPS
        </span>
        <span className="tabnum">
          PREVIEW <span className={fpsMeasured && fpsMeasured < 24 ? 'text-amber-400' : 'text-fg-soft'}>{fpsMeasured || '—'}</span> FPS
        </span>
        <span
          className="tabnum"
          title={msDetect > 25 ? 'CV kare süresi yüksek — Detection Scale değerini düşür' : 'CV kare süresi'}
        >
          CV <span className={msDetect > 25 ? 'text-amber-400' : 'text-fg-soft'}>{msDetect || '—'}</span> MS
        </span>
        <span className="tabnum">
          BLOBS <span className="text-fg-soft">{blobCount}</span>
        </span>
        {width > 0 && (
          <span className="tabnum">
            {width}×{height}
          </span>
        )}
        <span className="tabnum ml-auto">
          IN {formatTimecode(inPoint, fps)} · OUT {formatTimecode(outPoint, fps)}
        </span>
      </div>
    </div>
  )
}

function Handle({ side, left, onGrab }: { side: 'in' | 'out'; left: number; onGrab: () => void }) {
  return (
    <button
      type="button"
      title={side === 'in' ? 'In noktası' : 'Out noktası'}
      onPointerDown={(e) => {
        e.stopPropagation()
        const track = e.currentTarget.parentElement
        if (track) track.setPointerCapture(e.pointerId)
        onGrab()
      }}
      className="absolute top-0 h-full w-[7px] cursor-ew-resize"
      style={{ left: `calc(${left}% - 3px)` }}
    >
      <span className={`absolute inset-y-0 ${side === 'in' ? 'left-[3px]' : 'right-[3px]'} w-px bg-[var(--accent-ui)]/70`} />
      <span
        className={`absolute h-[5px] w-[5px] bg-[var(--accent-ui)]/70 ${
          side === 'in' ? 'top-0 left-[3px]' : 'top-0 right-[3px]'
        }`}
      />
    </button>
  )
}
