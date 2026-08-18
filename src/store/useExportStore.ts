import { create } from 'zustand'
import type { ExportSettings } from '../export/types'

const KEY = 'blobtrack.export.v1'

const DEFAULTS: ExportSettings = {
  format: 'mp4',
  resolution: 'original',
  customWidth: 1080,
  customHeight: 1920,
  supersample: 1,
  fps: 'source',
  bitrateMbps: 12,
  useRange: true,
  includeAudio: true,
  overlayOnly: false,
  alpha: false,
  telemetry: 'none',
}

export interface ExportState {
  open: boolean
  settings: ExportSettings
  setOpen: (open: boolean) => void
  patch: (patch: Partial<ExportSettings>) => void
}

function load(): ExportSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULTS
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<ExportSettings>) }
  } catch {
    return DEFAULTS
  }
}

export const useExportStore = create<ExportState>()((set, get) => ({
  open: false,
  settings: load(),
  setOpen: (open) => set({ open }),
  patch: (patch) => {
    const settings = { ...get().settings, ...patch }
    set({ settings })
    try {
      localStorage.setItem(KEY, JSON.stringify(settings))
    } catch {
      /* kota */
    }
  },
}))
