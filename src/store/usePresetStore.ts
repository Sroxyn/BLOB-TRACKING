import { create } from 'zustand'
import { BUILTIN_PRESETS, type Preset } from '../presets/presets'
import { defaultParams, sanitize, type Params } from './paramSchema'
import { paramsToHash, useParamsStore } from './useParamsStore'

const KEY = 'blobtrack.userPresets.v1'

export interface PresetState {
  user: Preset[]
  /** Preset seçici penceresi açık mı (maske de istenmesini tetikler). */
  pickerOpen: boolean
  setPickerOpen: (open: boolean) => void
  save: (name: string, params: Params) => void
  remove: (id: string) => void
  importJson: (text: string) => { ok: boolean; message: string }
  exportJson: () => string
}

function load(): Preset[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((p): p is Preset => typeof p === 'object' && p !== null && 'name' in p)
      .map((p) => ({
        id: p.id ?? crypto.randomUUID(),
        name: String(p.name),
        hint: 'kullanıcı preseti',
        category: 'user' as const,
        params: p.params ?? {},
      }))
  } catch {
    return []
  }
}

function persist(user: Preset[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(user))
  } catch {
    /* kota */
  }
}

export const usePresetStore = create<PresetState>()((set, get) => ({
  user: load(),
  pickerOpen: false,
  setPickerOpen: (pickerOpen) => set({ pickerOpen }),

  save: (name, params) => {
    const existing = get().user.find((p) => p.name === name)
    const preset: Preset = {
      id: existing?.id ?? crypto.randomUUID(),
      name,
      hint: 'kullanıcı preseti',
      category: 'user',
      params: params as Partial<Params>,
    }
    const user = existing
      ? get().user.map((p) => (p.id === preset.id ? preset : p))
      : get().user.concat([preset])
    set({ user })
    persist(user)
  },

  remove: (id) => {
    const user = get().user.filter((p) => p.id !== id)
    set({ user })
    persist(user)
  },

  importJson: (text) => {
    try {
      const parsed = JSON.parse(text) as unknown
      // İki biçim kabul edilir: preset dizisi veya tek bir parametre nesnesi
      if (Array.isArray(parsed)) {
        const incoming = parsed
          .filter((p): p is Preset => typeof p === 'object' && p !== null && 'params' in p)
          .map((p) => ({
            id: crypto.randomUUID(),
            name: String((p as Preset).name ?? 'preset'),
            hint: 'içe aktarıldı',
            category: 'user' as const,
            params: sanitize((p as Preset).params) as Partial<Params>,
          }))
        if (incoming.length === 0) return { ok: false, message: 'Dosyada preset bulunamadı.' }
        const user = get().user.concat(incoming)
        set({ user })
        persist(user)
        return { ok: true, message: `${incoming.length} preset içe aktarıldı.` }
      }
      if (parsed && typeof parsed === 'object') {
        useParamsStore.getState().setMany(sanitize(parsed))
        return { ok: true, message: 'Parametreler uygulandı.' }
      }
      return { ok: false, message: 'Tanınmayan dosya biçimi.' }
    } catch {
      return { ok: false, message: 'JSON okunamadı.' }
    }
  },

  exportJson: () => JSON.stringify(get().user, null, 2),
}))

/** Preset uygular: önce varsayılanlara dön, sonra preset alanlarını yaz. */
export function applyPreset(preset: Preset): void {
  useParamsStore.getState().setMany({ ...defaultParams(), ...preset.params }, { preset: preset.id })
}

export function allPresets(user: Preset[]): Preset[] {
  return [...BUILTIN_PRESETS, ...user]
}

/** Paylaşılabilir bağlantı — parametreler URL hash'inde, sunucuya hiçbir şey gitmez. */
export function shareUrl(params: Params): string {
  const base = `${location.origin}${location.pathname}`
  return `${base}#p=${paramsToHash(params)}`
}
