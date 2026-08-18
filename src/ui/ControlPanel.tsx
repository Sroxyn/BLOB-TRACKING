import { memo } from 'react'
import { ChevronRight, Dices, Lock, RotateCcw, Undo2, Redo2, Unlock } from 'lucide-react'
import {
  GROUPS,
  PARAM_KEYS,
  getDef,
  isVisible,
  type GroupId,
  type ParamKey,
  type Params,
} from '../store/paramSchema'
import { useParamsStore } from '../store/useParamsStore'
import { ColorField, SelectField, Slider, TextField, Toggle, useCollapsed } from './controls/primitives'
import { PresetBar } from './PresetBar'

/** Şemadan tek bir kontrol üretir. Elle slider yazılmaz. */
const ParamRow = memo(function ParamRow({ paramKey }: { paramKey: ParamKey }) {
  const value = useParamsStore((s) => s.params[paramKey])
  const locked = useParamsStore((s) => s.locks[paramKey] === true)
  const setParam = useParamsStore((s) => s.setParam)
  const resetParam = useParamsStore((s) => s.resetParam)
  const toggleLock = useParamsStore((s) => s.toggleLock)
  const def = getDef(paramKey)

  const set = (v: unknown) => setParam(paramKey, v as Params[ParamKey])

  let control: React.ReactNode = null
  switch (def.kind) {
    case 'float':
    case 'int':
      control = (
        <Slider
          label={def.label}
          value={value as number}
          min={def.min}
          max={def.max}
          step={def.step}
          unit={def.unit}
          integer={def.kind === 'int'}
          onChange={set}
          onReset={() => resetParam(paramKey)}
        />
      )
      break
    case 'bool':
      control = <Toggle label={def.label} value={value as boolean} onChange={set} />
      break
    case 'enum':
      control = <SelectField label={def.label} value={value as string} options={def.options} onChange={set} />
      break
    case 'color':
      control = <ColorField label={def.label} value={value as string} onChange={set} />
      break
    case 'text':
      control = <TextField label={def.label} value={value as string} onChange={set} />
      break
  }

  return (
    <div className="group relative" title={def.hint}>
      {control}
      <button
        type="button"
        onClick={() => toggleLock(paramKey)}
        title={locked ? 'Randomize sırasında kilitli' : 'Randomize için kilitle'}
        className={`absolute top-1/2 -left-[15px] -translate-y-1/2 p-[2px] text-dim transition-opacity hover:text-fg ${
          locked ? 'opacity-100 text-[var(--accent-ui)]' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        {locked ? <Lock size={9} /> : <Unlock size={9} />}
      </button>
    </div>
  )
})

function Section({ id, label, keys }: { id: GroupId; label: string; keys: ParamKey[] }) {
  const [collapsed, setCollapsed] = useCollapsed(`g.${id}`, id !== 'source' && id !== 'detection')
  if (keys.length === 0) return null
  return (
    <section className="border-b border-line-soft">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center gap-1 px-3 py-2 text-[10px] tracking-[0.14em] text-fg-soft hover:text-fg"
      >
        <ChevronRight size={11} className={`transition-transform ${collapsed ? '' : 'rotate-90'}`} />
        {label}
        <span className="ml-auto tabnum text-[9px] text-dim">{keys.length}</span>
      </button>
      {!collapsed && (
        <div className="flex flex-col gap-[3px] px-3 pt-px pb-3 pl-[19px]">
          {keys.map((k) => (
            <ParamRow key={k} paramKey={k} />
          ))}
        </div>
      )}
    </section>
  )
}

export function ControlPanel() {
  const params = useParamsStore((s) => s.params)
  const advanced = useParamsStore((s) => s.advanced)
  const setAdvanced = useParamsStore((s) => s.setAdvanced)
  const randomize = useParamsStore((s) => s.randomize)
  const resetAll = useParamsStore((s) => s.resetAll)
  const undo = useParamsStore((s) => s.undo)
  const redo = useParamsStore((s) => s.redo)
  const canUndo = useParamsStore((s) => s.past.length > 0)
  const canRedo = useParamsStore((s) => s.future.length > 0)

  const visible = PARAM_KEYS.filter((k) => {
    const def = getDef(k)
    if (def.advanced && !advanced) return false
    return isVisible(k, params)
  })

  return (
    <aside className="flex h-full w-full flex-col border-l border-line bg-ink-1">
      <header className="flex items-center gap-1 border-b border-line px-3 py-2">
        <span className="text-[10px] tracking-[0.2em] text-fg">CONTROL</span>
        <div className="ml-auto flex items-center gap-px">
          <IconButton label="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}>
            <Undo2 size={12} />
          </IconButton>
          <IconButton label="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={redo}>
            <Redo2 size={12} />
          </IconButton>
          <IconButton label="Randomize (kilitli olanlar korunur)" onClick={randomize}>
            <Dices size={12} />
          </IconButton>
          <IconButton label="Tümünü sıfırla (R)" onClick={resetAll}>
            <RotateCcw size={12} />
          </IconButton>
        </div>
      </header>

      <div className="no-scrollbar flex-1 overflow-y-auto">
        <PresetBar />
        {GROUPS.map((g) => (
          <Section key={g.id} id={g.id} label={g.label} keys={visible.filter((k) => getDef(k).group === g.id)} />
        ))}
        <div className="flex items-center justify-between px-3 py-3">
          <button
            type="button"
            onClick={() => setAdvanced(!advanced)}
            className={`text-[10px] tracking-wide ${advanced ? 'text-[var(--accent-ui)]' : 'text-dim hover:text-fg-soft'}`}
          >
            {advanced ? '— GELİŞMİŞ AÇIK' : '+ GELİŞMİŞ PARAMETRELER'}
          </button>
          <span className="tabnum text-[9px] text-dim">{visible.length}/{PARAM_KEYS.length}</span>
        </div>
      </div>
    </aside>
  )
}

export function IconButton({
  children,
  label,
  onClick,
  disabled,
  active,
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
  active?: boolean
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`grid h-6 w-6 place-items-center rounded-[2px] transition-colors disabled:opacity-25 ${
        active ? 'bg-ink-4 text-[var(--accent-ui)]' : 'text-fg-soft hover:bg-ink-3 hover:text-fg'
      }`}
    >
      {children}
    </button>
  )
}
