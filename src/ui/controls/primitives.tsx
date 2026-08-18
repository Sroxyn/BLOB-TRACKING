import { useCallback, useEffect, useRef, useState } from 'react'

/* ── Slider ───────────────────────────────────────────────────────────────
 * Sürükle (mutlak konum) · Shift ile 0.2× ince ayar · çift tıkla varsayılan ·
 * sağdaki kutuya sayı yazıp Enter.
 * ------------------------------------------------------------------------ */

export interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit?: string
  integer?: boolean
  onChange: (v: number) => void
  onReset: () => void
}

function snap(v: number, min: number, max: number, step: number, integer: boolean): number {
  const snapped = Math.round((v - min) / step) * step + min
  const clamped = Math.min(max, Math.max(min, snapped))
  return integer ? Math.round(clamped) : Number(clamped.toFixed(5))
}

function display(v: number, step: number, integer: boolean): string {
  if (integer) return String(Math.round(v))
  const decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3
  return v.toFixed(decimals)
}

export function Slider(props: SliderProps) {
  const { label, value, min, max, step, unit, integer = false, onChange, onReset } = props
  const barRef = useRef<HTMLDivElement>(null)
  const lastX = useRef(0)
  const [editing, setEditing] = useState<string | null>(null)
  const pct = ((value - min) / (max - min)) * 100

  const apply = useCallback(
    (clientX: number, shift: boolean) => {
      const el = barRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      if (shift) {
        const dx = clientX - lastX.current
        const next = value + (dx / rect.width) * (max - min) * 0.2
        onChange(snap(next, min, max, step, integer))
      } else {
        const t = (clientX - rect.left) / rect.width
        onChange(snap(min + t * (max - min), min, max, step, integer))
      }
      lastX.current = clientX
    },
    [value, min, max, step, integer, onChange],
  )

  return (
    <div className="flex items-center gap-1">
      <div
        ref={barRef}
        className="relative h-[22px] flex-1 cursor-ew-resize select-none overflow-hidden rounded-[2px] bg-ink-3 hover:bg-ink-4/70"
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.currentTarget.setPointerCapture(e.pointerId)
          lastX.current = e.clientX
          apply(e.clientX, e.shiftKey)
        }}
        onPointerMove={(e) => {
          if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
          apply(e.clientX, e.shiftKey)
        }}
        onDoubleClick={onReset}
        title={`${label} · çift tıkla varsayılan · Shift ile ince ayar`}
      >
        <div
          className="pointer-events-none absolute inset-y-0 left-0 bg-[var(--accent-ui)] opacity-25"
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
        <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-[10px] tracking-wide text-fg-soft">
          {label}
        </span>
        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] text-dim">
          {unit}
        </span>
      </div>
      <input
        className="tabnum h-[22px] w-[52px] shrink-0 rounded-[2px] bg-ink-2 px-1 text-right text-[10px] text-fg outline-none focus:bg-ink-3 focus:ring-1 focus:ring-[var(--accent-ui)]/40"
        value={editing ?? display(value, step, integer)}
        onChange={(e) => setEditing(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => {
          if (editing !== null) {
            const n = Number(editing.replace(',', '.'))
            if (Number.isFinite(n)) onChange(snap(n, min, max, step, integer))
            setEditing(null)
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            setEditing(null)
            e.currentTarget.blur()
          }
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault()
            const dir = e.key === 'ArrowUp' ? 1 : -1
            const mult = e.shiftKey ? 10 : 1
            setEditing(null)
            onChange(snap(value + dir * step * mult, min, max, step, integer))
          }
        }}
      />
    </div>
  )
}

/* ── Toggle ───────────────────────────────────────────────────────────── */

export function Toggle({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="flex h-[22px] w-full items-center justify-between rounded-[2px] bg-ink-3 px-2 text-[10px] tracking-wide text-fg-soft hover:bg-ink-4/70"
    >
      <span>{label}</span>
      <span
        className={`relative h-[10px] w-[20px] rounded-full transition-colors ${
          value ? 'bg-[var(--accent-ui)]/70' : 'bg-ink-1'
        }`}
      >
        <span
          className={`absolute top-[1px] h-[8px] w-[8px] rounded-full transition-[left] ${
            value ? 'left-[11px] bg-[var(--accent-ui)]' : 'left-[1px] bg-dim'
          }`}
        />
      </span>
    </button>
  )
}

/* ── Select ───────────────────────────────────────────────────────────── */

export function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: readonly string[]
  onChange: (v: string) => void
}) {
  return (
    <label className="relative flex h-[22px] items-center rounded-[2px] bg-ink-3 hover:bg-ink-4/70">
      <span className="pointer-events-none absolute left-2 text-[10px] tracking-wide text-fg-soft">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-full w-full cursor-pointer appearance-none bg-transparent pr-2 pl-2 text-right text-[10px] text-fg outline-none"
      >
        {options.map((o) => (
          <option key={o} value={o} className="bg-ink-2 text-left">
            {prettyOption(o)}
          </option>
        ))}
      </select>
    </label>
  )
}

export function prettyOption(o: string): string {
  if (/^[#0-9]|^TRK/.test(o)) return o
  return o.replace(/-/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase()
}

/* ── Color ────────────────────────────────────────────────────────────── */

export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="flex h-[22px] cursor-pointer items-center gap-2 rounded-[2px] bg-ink-3 px-2 hover:bg-ink-4/70">
      <span className="flex-1 text-[10px] tracking-wide text-fg-soft">{label}</span>
      <span className="tabnum text-[10px] text-dim">{value.toUpperCase()}</span>
      <span className="h-[12px] w-[18px] rounded-[2px] ring-1 ring-line" style={{ background: value }} />
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pointer-events-auto h-0 w-0 opacity-0"
      />
    </label>
  )
}

/* ── Text ─────────────────────────────────────────────────────────────── */

export function TextField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string
  value: string
  placeholder?: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] tracking-wide text-fg-soft">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-[22px] rounded-[2px] bg-ink-3 px-2 text-[10px] text-fg outline-none placeholder:text-dim focus:ring-1 focus:ring-[var(--accent-ui)]/40"
      />
    </div>
  )
}

/* ── Section (katlanır, durum localStorage'da) ────────────────────────── */

export function useCollapsed(id: string, initial = false) {
  const key = `blobtrack.section.${id}`
  const [collapsed, setCollapsed] = useState(() => {
    const v = localStorage.getItem(key)
    return v === null ? initial : v === '1'
  })
  useEffect(() => {
    localStorage.setItem(key, collapsed ? '1' : '0')
  }, [key, collapsed])
  return [collapsed, setCollapsed] as const
}
