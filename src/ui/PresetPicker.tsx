import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Search, Trash2, X } from 'lucide-react'
import { BUILTIN_PRESETS, PRESET_CATEGORIES, type Preset, type PresetCategory } from '../presets/presets'
import { applyPreset, usePresetStore } from '../store/usePresetStore'
import { useParamsStore } from '../store/useParamsStore'
import { useMediaStore } from '../store/useMediaStore'
import { defaultParams } from '../store/paramSchema'
import { renderFrame } from '../render/renderer'
import { getLatestFrame, subscribeLatestFrame } from '../render/latestFrame'
import { videoEngine } from '../media/VideoEngine'

/**
 * Preset seçici — kategorili ızgara, her kart mevcut karenin CANLI önizlemesi.
 *
 * Küçük önizlemeler tek bir CV sonucunu paylaşır (tespit bir kez yapılır,
 * her preset yalnızca yeniden ÇİZİLİR). Bu yüzden tespit parametrelerini
 * değiştiren presetlerde (eşik, kaynak modu) minik görsel yaklaşıktır —
 * preset uygulandığında gerçek sonuç görünür.
 */
export function PresetPicker() {
  const open = usePresetStore((s) => s.pickerOpen)
  const setOpen = usePresetStore((s) => s.setPickerOpen)
  const user = usePresetStore((s) => s.user)
  const remove = usePresetStore((s) => s.remove)
  const activePreset = useParamsStore((s) => s.activePreset)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<PresetCategory | 'all'>('all')

  const presets = useMemo(() => [...BUILTIN_PRESETS, ...user], [user])
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr')
    return presets.filter((p) => {
      if (category !== 'all' && p.category !== category) return false
      if (!q) return true
      return `${p.name} ${p.hint}`.toLocaleLowerCase('tr').includes(q)
    })
  }, [presets, query, category])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  if (!open) return null

  const categories = PRESET_CATEGORIES.filter((c) => c.id !== 'user' || user.length > 0)

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-0/85 p-4" onClick={() => setOpen(false)}>
      <div
        className="flex max-h-full w-full max-w-[900px] flex-col overflow-hidden rounded-[3px] border border-line bg-ink-1 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-line px-3 py-2">
          <span className="text-[10px] tracking-[0.2em] text-fg">PRESET SEÇ</span>
          <span className="tabnum text-[9px] text-dim">{filtered.length}</span>
          <label className="ml-auto flex h-6 items-center gap-1 rounded-[2px] bg-ink-3 px-2">
            <Search size={10} className="text-dim" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ara…"
              className="w-[140px] bg-transparent text-[10px] text-fg outline-none placeholder:text-dim"
            />
          </label>
          <button type="button" onClick={() => setOpen(false)} className="text-dim hover:text-fg" title="Kapat (Esc)">
            <X size={13} />
          </button>
        </header>

        <div className="no-scrollbar flex shrink-0 gap-1 overflow-x-auto border-b border-line-soft px-3 py-2">
          <CategoryChip active={category === 'all'} onClick={() => setCategory('all')} label="TÜMÜ" />
          {categories.map((c) => (
            <CategoryChip
              key={c.id}
              active={category === c.id}
              onClick={() => setCategory(c.id)}
              label={c.label}
            />
          ))}
        </div>

        <div className="no-scrollbar grid flex-1 grid-cols-2 gap-2 overflow-y-auto p-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {filtered.map((preset, i) => (
            <PresetCard
              key={preset.id}
              preset={preset}
              index={presets.indexOf(preset)}
              active={activePreset === preset.id}
              onApply={() => {
                applyPreset(preset)
                setOpen(false)
              }}
              onRemove={preset.category === 'user' ? () => remove(preset.id) : undefined}
              delayMs={i * 12}
            />
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full py-10 text-center text-[10px] text-dim">Eşleşen preset yok.</div>
          )}
        </div>
      </div>
    </div>
  )
}

function CategoryChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-[2px] px-2 py-1 text-[9px] tracking-[0.12em] whitespace-nowrap ${
        active ? 'bg-[var(--accent-ui)]/20 text-[var(--accent-ui)]' : 'bg-ink-2 text-dim hover:bg-ink-3 hover:text-fg-soft'
      }`}
    >
      {label}
    </button>
  )
}

function PresetCard({
  preset,
  index,
  active,
  onApply,
  onRemove,
  delayMs,
}: {
  preset: Preset
  index: number
  active: boolean
  onApply: () => void
  onRemove?: () => void
  delayMs: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const status = useMediaStore((s) => s.status)

  useEffect(() => {
    let cancelled = false
    const draw = () => {
      const canvas = canvasRef.current
      if (!canvas || cancelled) return
      const ctx = canvas.getContext('2d')
      const el = videoEngine.el
      const result = getLatestFrame()
      if (!ctx) return
      if (!el.videoWidth || el.readyState < 2) {
        ctx.fillStyle = '#0e0e10'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        return
      }
      const p = { ...defaultParams(), ...preset.params }
      // Küçük önizleme: piksel uzayı küçüldüğü için çizgi/yazı ölçekleri de küçülür.
      const k = canvas.width / el.videoWidth
      const scaled = {
        ...p,
        boxStrokeWidth: Math.max(0.5, p.boxStrokeWidth * k * 2),
        boxPadding: p.boxPadding * k * 2,
        labelSize: Math.max(5, p.labelSize * k * 2),
        hudSize: Math.max(4, p.hudSize * k * 2),
        hudMargin: p.hudMargin * k * 2,
        centroidDot: p.centroidDot * k * 2,
        reticleRadius: p.reticleRadius * k * 2,
        gridSize: Math.max(6, p.gridSize * k * 2),
        trailWidth: Math.max(0.4, p.trailWidth * k * 2),
        contourWidth: Math.max(0.4, p.contourWidth * k * 2),
        linkWidth: Math.max(0.4, p.linkWidth * k * 2),
        boxGlow: p.boxGlow * k * 2,
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.save()
      ctx.scale(canvas.width / el.videoWidth, canvas.height / el.videoHeight)
      renderFrame(ctx, el, result, scaled, {
        width: el.videoWidth,
        height: el.videoHeight,
        time: el.currentTime,
        frameIndex: result?.frameIndex ?? 0,
        fps: videoEngine.fps,
        scaleX: result ? el.videoWidth / result.detectionWidth : 1,
        scaleY: result ? el.videoHeight / result.detectionHeight : 1,
        overlayOnly: false,
      })
      ctx.restore()
    }

    // Kartlar sırayla çizilir; 30 kart aynı anda çizilince açılış takılıyor.
    const timer = setTimeout(draw, delayMs)
    const off = subscribeLatestFrame(draw)
    return () => {
      cancelled = true
      clearTimeout(timer)
      off()
    }
  }, [preset, delayMs, status])

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onApply}
        className={`block w-full overflow-hidden rounded-[2px] border text-left transition-colors ${
          active ? 'border-[var(--accent-ui)]' : 'border-line hover:border-line-soft hover:bg-ink-2'
        }`}
      >
        <span className="checkerboard block aspect-[9/16] w-full">
          <canvas ref={canvasRef} width={162} height={288} className="h-full w-full" />
        </span>
        <span className="flex items-center gap-1 px-2 pt-1.5 text-[10px] text-fg">
          {index < 9 && <span className="tabnum text-dim">{index + 1}</span>}
          <span className="truncate">{preset.name}</span>
          {active && <Check size={10} className="ml-auto text-[var(--accent-ui)]" />}
        </span>
        <span className="block truncate px-2 pb-2 text-[9px] text-dim">{preset.hint}</span>
      </button>
      {onRemove && (
        <button
          type="button"
          title="Preseti sil"
          onClick={onRemove}
          className="absolute top-1 right-1 hidden rounded-[2px] bg-ink-0/80 p-1 text-dim group-hover:block hover:text-red-400"
        >
          <Trash2 size={10} />
        </button>
      )}
    </div>
  )
}
