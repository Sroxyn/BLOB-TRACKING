import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { useMediaStore } from '../store/useMediaStore'
import { useParamsStore } from '../store/useParamsStore'
import { videoEngine } from '../media/VideoEngine'
import { renderFrame, type ViewInfo } from '../render/renderer'
import type { FrameResult } from '../cv/types'
import { Detector } from '../worker/detector'
import { usePresetStore } from '../store/usePresetStore'
import { setLatestFrame } from '../render/latestFrame'

/** Viewport üstü kısayol rozetleri — maske önizlemesi eşiği kör ayarlamayı önler. */
function ViewportChips() {
  const maskPreview = useMediaStore((s) => s.maskPreview)
  const setMaskPreview = useMediaStore((s) => s.setMaskPreview)
  const blobCount = useMediaStore((s) => s.blobCount)
  return (
    <div className="pointer-events-none absolute top-2 right-3 z-10 flex items-center gap-1">
      <span className="tabnum rounded-[2px] bg-ink-0/70 px-2 py-1 text-[9px] tracking-[0.14em] text-dim">
        BLOBS {blobCount}
      </span>
      <button
        type="button"
        onClick={() => setMaskPreview(!maskPreview)}
        title="Maske önizlemesi (M)"
        className={`pointer-events-auto rounded-[2px] px-2 py-1 text-[9px] tracking-[0.14em] ${
          maskPreview ? 'bg-[var(--accent-ui)]/20 text-[var(--accent-ui)]' : 'bg-ink-0/70 text-dim hover:text-fg-soft'
        }`}
      >
        MASK · M
      </button>
      <span className="rounded-[2px] bg-ink-0/70 px-2 py-1 text-[9px] tracking-[0.14em] text-dim">RAW · \</span>
    </div>
  )
}

/**
 * Viewport — letterbox'lu çizim yüzeyi ve önizleme döngüsü.
 *
 * Canvas her zaman kaynak çözünürlüğündedir; CSS ile ölçeklenir. Böylece
 * önizleme ile export aynı piksel uzayında, aynı `renderFrame` ile çalışır.
 *
 * CV worker'da asenkron çalıştığı için çizim, gelen SON sonucu kullanır;
 * sonuç geldiğinde yeniden çizim planlanır. Böylece ana thread bloklanmaz.
 */
export function Viewport({ onPickFile }: { onPickFile: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
  const paramsRef = useRef(useParamsStore.getState().params)
  const resultRef = useRef<FrameResult | null>(null)
  const rafRef = useRef<number | null>(null)
  const perf = useRef({ frames: 0, last: 0 })
  const detectorRef = useRef<Detector | null>(null)

  const status = useMediaStore((s) => s.status)
  const width = useMediaStore((s) => s.width)
  const height = useMediaStore((s) => s.height)
  const [box, setBox] = useState({ w: 0, h: 0 })

  /* Letterbox ölçüsü */
  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    const fit = () => {
      const r = host.getBoundingClientRect()
      const aspect = width && height ? width / height : 16 / 9
      const availW = Math.max(0, r.width - 24)
      const availH = Math.max(0, r.height - 24)
      const w = Math.min(availW, availH * aspect)
      setBox({ w, h: w / aspect })
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(host)
    return () => ro.disconnect()
  }, [width, height])

  /* Canvas boyutu = kaynak çözünürlüğü */
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    c.width = width || 16
    c.height = height || 9
    ctxRef.current = c.getContext('2d', { alpha: true, desynchronized: true })
  }, [width, height])

  /* Çizim döngüsü */
  useEffect(() => {
    const detector = (detectorRef.current ??= new Detector())

    const draw = () => {
      rafRef.current = null
      const ctx = ctxRef.current
      const el = videoEngine.el
      if (!ctx || !el.videoWidth || el.readyState < 2) return
      const media = useMediaStore.getState()
      let p = paramsRef.current
      const result = resultRef.current

      if (media.maskPreview) p = { ...p, backgroundMode: 'mask', maskOverlay: false }

      const view: ViewInfo = {
        width: el.videoWidth,
        height: el.videoHeight,
        time: el.currentTime,
        frameIndex: videoEngine.frameIndex,
        fps: videoEngine.fps,
        scaleX: result ? el.videoWidth / result.detectionWidth : 1,
        scaleY: result ? el.videoHeight / result.detectionHeight : 1,
        overlayOnly: false,
      }

      if (media.showRaw) {
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.clearRect(0, 0, view.width, view.height)
        ctx.drawImage(el, 0, 0, view.width, view.height)
      } else {
        renderFrame(ctx, el, result, p, view)
      }

      const now = performance.now()
      perf.current.frames++
      if (perf.current.last === 0) perf.current.last = now
      else if (now - perf.current.last > 500) {
        const fps = (perf.current.frames * 1000) / (now - perf.current.last)
        perf.current = { frames: 0, last: now }
        useMediaStore.getState().setStats({ fpsMeasured: Math.round(fps) })
      }
    }

    const schedule = () => {
      if (rafRef.current === null) rafRef.current = requestAnimationFrame(draw)
    }

    /** CV isteği gönder; sonuç geldiğinde yeniden çiz. */
    const detect = () => {
      const el = videoEngine.el
      if (!el.videoWidth || el.readyState < 2) return
      const media = useMediaStore.getState()
      if (media.showRaw) return
      detector.request(
        el,
        videoEngine.frameIndex,
        el.currentTime,
        paramsRef.current,
        videoEngine.fps,
        media.maskPreview || usePresetStore.getState().pickerOpen,
        (result) => {
          resultRef.current = result
          setLatestFrame(result)
          const store = useMediaStore.getState()
          const count = result.tracks.length || result.blobs.length
          const ms = Math.round(detector.lastMs * 10) / 10
          if (store.blobCount !== count || Math.abs(store.msDetect - ms) > 0.4) {
            store.setStats({ blobCount: count, msDetect: ms })
          }
          schedule()
        },
      )
    }

    const offFrame = videoEngine.subscribe(() => {
      const t = videoEngine.el.currentTime
      const media = useMediaStore.getState()
      if (Math.abs(media.currentTime - t) > 1e-4) media.setCurrentTime(t)
      detect()
      schedule()
    })

    const offParams = useParamsStore.subscribe((s) => {
      const prev = paramsRef.current
      paramsRef.current = s.params
      // detectionScale değişimi tampon boyutlarını değiştirir → geçmişi temizle
      if (prev.detectionScale !== s.params.detectionScale) detector.reset()
      detect()
      schedule()
    })

    let prevMedia = useMediaStore.getState()
    const offMedia = useMediaStore.subscribe((s) => {
      const changed = s.showRaw !== prevMedia.showRaw || s.maskPreview !== prevMedia.maskPreview
      prevMedia = s
      if (changed) {
        detect()
        schedule()
      }
    })

    // Preset seçici açılınca maskeye de ihtiyaç var (maske tabanlı presetlerin
    // küçük önizlemesi için) → yeniden tespit iste.
    let prevPicker = usePresetStore.getState().pickerOpen
    const offPicker = usePresetStore.subscribe((s) => {
      if (s.pickerOpen !== prevPicker) {
        prevPicker = s.pickerOpen
        if (s.pickerOpen) detect()
      }
    })

    detect()
    schedule()

    return () => {
      offFrame()
      offParams()
      offMedia()
      offPicker()
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [])

  /* Kaynak değişince CV geçmişini sıfırla ve ilk kareyi hemen çiz */
  useEffect(() => {
    detectorRef.current?.reset()
    resultRef.current = null
    setLatestFrame(null)
    if (width > 0 && height > 0) videoEngine.emitNow()
  }, [width, height])

  return (
    <div ref={hostRef} className="relative grid flex-1 place-items-center overflow-hidden bg-ink-0">
      {status === 'ready' && <ViewportChips />}
      <div
        className="checkerboard relative shadow-[0_0_0_1px_var(--color-line)]"
        style={{ width: box.w || 1, height: box.h || 1 }}
      >
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        {status !== 'ready' && (
          <div className="absolute inset-0 grid place-items-center text-center">
            <button
              type="button"
              onClick={onPickFile}
              className="group flex flex-col items-center gap-4 rounded-[3px] border border-dashed border-line px-8 py-7 transition-colors hover:border-[var(--accent-ui)]/50"
            >
              <Upload size={20} className="text-dim transition-colors group-hover:text-[var(--accent-ui)]" />
              <span className="text-[11px] tracking-[0.18em] text-fg-soft">
                {status === 'loading' ? 'ÇÖZÜMLENİYOR…' : 'VİDEO SEÇ veya BURAYA SÜRÜKLE'}
              </span>
              <span className="max-w-[280px] text-[10px] leading-relaxed text-dim">
                MP4 · MOV · WEBM — dosya cihazından çıkmaz, hiçbir şey sunucuya yüklenmez.
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
