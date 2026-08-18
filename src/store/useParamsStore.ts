import { create } from 'zustand'
import {
  PARAM_KEYS,
  defaultParams,
  getDef,
  sanitize,
  type ParamKey,
  type ParamValue,
  type Params,
} from './paramSchema'

const STORAGE_KEY = 'blobtrack.params.v1'
const LOCK_KEY = 'blobtrack.locks.v1'
const HISTORY_LIMIT = 50
/** Aynı parametreye bu süre içinde gelen ardışık değişiklikler tek undo adımı sayılır. */
const COALESCE_MS = 600

export interface ParamsState {
  params: Params
  /** Randomize sırasında korunacak parametreler. */
  locks: Partial<Record<ParamKey, boolean>>
  advanced: boolean
  activePreset: string | null
  past: Params[]
  future: Params[]
  setParam: <K extends ParamKey>(key: K, value: Params[K]) => void
  setMany: (patch: Partial<Params>, opts?: { history?: boolean; preset?: string | null }) => void
  resetAll: () => void
  resetParam: (key: ParamKey) => void
  toggleLock: (key: ParamKey) => void
  setAdvanced: (v: boolean) => void
  randomize: () => void
  undo: () => void
  redo: () => void
}

function loadParams(): Params {
  // URL hash paylaşımı localStorage'ı ezer: #p=<base64 json>
  try {
    const hash = new URLSearchParams(location.hash.replace(/^#/, ''))
    const p = hash.get('p')
    if (p) {
      const json = decodeURIComponent(escape(atob(p.replace(/-/g, '+').replace(/_/g, '/'))))
      return sanitize(JSON.parse(json))
    }
  } catch {
    /* bozuk hash yok sayılır */
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return sanitize(JSON.parse(raw))
  } catch {
    /* bozuk kayıt yok sayılır */
  }
  return defaultParams()
}

function loadLocks(): Partial<Record<ParamKey, boolean>> {
  try {
    const raw = localStorage.getItem(LOCK_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: Partial<Record<ParamKey, boolean>> = {}
    for (const k of PARAM_KEYS) if (parsed[k] === true) out[k] = true
    return out
  } catch {
    return {}
  }
}

let saveTimer: number | undefined
function persist(params: Params) {
  if (saveTimer !== undefined) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(params))
    } catch {
      /* kota dolu olabilir */
    }
  }, 250) as unknown as number
}

let lastTouchedKey: ParamKey | null = null
let lastTouchedAt = 0

function pushHistory(state: ParamsState, snapshot: Params): Pick<ParamsState, 'past' | 'future'> {
  const past = state.past.concat([snapshot])
  if (past.length > HISTORY_LIMIT) past.shift()
  return { past, future: [] }
}

export const useParamsStore = create<ParamsState>()((set, get) => ({
  params: loadParams(),
  locks: loadLocks(),
  advanced: localStorage.getItem('blobtrack.advanced') === '1',
  activePreset: null,
  past: [],
  future: [],

  setParam: (key, value) => {
    const state = get()
    if (state.params[key] === value) return
    const now = performance.now()
    const coalesce = lastTouchedKey === key && now - lastTouchedAt < COALESCE_MS
    lastTouchedKey = key
    lastTouchedAt = now
    const params = { ...state.params, [key]: value }
    set({
      params,
      activePreset: null,
      ...(coalesce ? { future: [] } : pushHistory(state, state.params)),
    })
    persist(params)
  },

  setMany: (patch, opts) => {
    const state = get()
    const params = sanitize({ ...state.params, ...patch })
    lastTouchedKey = null
    set({
      params,
      activePreset: opts?.preset ?? null,
      ...(opts?.history === false ? {} : pushHistory(state, state.params)),
    })
    persist(params)
  },

  resetAll: () => get().setMany(defaultParams(), { preset: null }),

  resetParam: (key) => {
    const def = getDef(key)
    get().setMany({ [key]: def.default } as Partial<Params>)
  },

  toggleLock: (key) => {
    const locks = { ...get().locks }
    if (locks[key]) delete locks[key]
    else locks[key] = true
    set({ locks })
    try {
      localStorage.setItem(LOCK_KEY, JSON.stringify(locks))
    } catch {
      /* yok say */
    }
  },

  setAdvanced: (v) => {
    set({ advanced: v })
    localStorage.setItem('blobtrack.advanced', v ? '1' : '0')
  },

  randomize: () => {
    const { params, locks } = get()
    const patch: Record<string, ParamValue> = {}
    for (const key of PARAM_KEYS) {
      const def = getDef(key)
      if (def.noRandom || locks[key]) continue
      switch (def.kind) {
        case 'float':
        case 'int': {
          const t = Math.random()
          const raw = def.min + t * (def.max - def.min)
          const snapped = Math.round(raw / def.step) * def.step
          patch[key] = def.kind === 'int' ? Math.round(snapped) : Number(snapped.toFixed(4))
          break
        }
        case 'bool':
          patch[key] = Math.random() < 0.5
          break
        case 'enum': {
          const i = Math.floor(Math.random() * def.options.length)
          patch[key] = def.options[i] ?? def.default
          break
        }
        case 'color': {
          const h = Math.floor(Math.random() * 360)
          patch[key] = hslToHex(h, 90, 55)
          break
        }
        case 'text':
          break
      }
    }
    get().setMany({ ...params, ...patch } as Partial<Params>)
  },

  undo: () => {
    const { past, params, future } = get()
    const prev = past[past.length - 1]
    if (!prev) return
    lastTouchedKey = null
    set({ params: prev, past: past.slice(0, -1), future: [params, ...future].slice(0, HISTORY_LIMIT) })
    persist(prev)
  },

  redo: () => {
    const { past, params, future } = get()
    const next = future[0]
    if (!next) return
    lastTouchedKey = null
    set({ params: next, past: past.concat([params]).slice(-HISTORY_LIMIT), future: future.slice(1) })
    persist(next)
  },
}))

export function hslToHex(h: number, s: number, l: number): string {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const c = l / 100 - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)))
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

/** Mevcut parametreleri paylaşılabilir URL hash'ine sıkıştırır. */
export function paramsToHash(params: Params): string {
  const base = defaultParams() as unknown as Record<string, ParamValue>
  const diff: Record<string, ParamValue> = {}
  const cur = params as unknown as Record<string, ParamValue>
  for (const k of PARAM_KEYS) if (cur[k] !== base[k]) diff[k] = cur[k] as ParamValue
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(diff))))
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
