import { create } from 'zustand'

export type MediaStatus = 'empty' | 'loading' | 'ready' | 'error'

export interface MediaState {
  status: MediaStatus
  error: string | null
  /** Object URL — hiçbir zaman ağ üzerinden gitmez. */
  url: string | null
  fileName: string | null
  width: number
  height: number
  duration: number
  /** Kaynak fps tahmini; `requestVideoFrameCallback` ile ölçülür, yoksa 30 varsayılır. */
  fps: number
  hasAudio: boolean

  playing: boolean
  currentTime: number
  loop: boolean
  inPoint: number
  outPoint: number

  /** Görüntüleme modları (render dışı UI durumu). */
  maskPreview: boolean
  showRaw: boolean

  /** Ölçülen önizleme performansı. */
  fpsMeasured: number
  blobCount: number
  /** Son CV kare süresi (ms). */
  msDetect: number

  load: (info: {
    url: string
    fileName: string
    width: number
    height: number
    duration: number
    fps: number
    hasAudio: boolean
  }) => void
  unload: () => void
  setStatus: (status: MediaStatus, error?: string | null) => void
  setPlaying: (playing: boolean) => void
  setCurrentTime: (t: number) => void
  setRange: (inPoint: number, outPoint: number) => void
  setLoop: (loop: boolean) => void
  setMaskPreview: (v: boolean) => void
  setShowRaw: (v: boolean) => void
  setStats: (stats: { fpsMeasured?: number; blobCount?: number; msDetect?: number }) => void
}

const EMPTY = {
  status: 'empty' as MediaStatus,
  error: null,
  url: null,
  fileName: null,
  width: 0,
  height: 0,
  duration: 0,
  fps: 30,
  hasAudio: false,
  playing: false,
  currentTime: 0,
  loop: true,
  inPoint: 0,
  outPoint: 0,
  maskPreview: false,
  showRaw: false,
  fpsMeasured: 0,
  blobCount: 0,
  msDetect: 0,
}

export const useMediaStore = create<MediaState>()((set, get) => ({
  ...EMPTY,

  load: (info) =>
    set({
      ...EMPTY,
      status: 'ready',
      url: info.url,
      fileName: info.fileName,
      width: info.width,
      height: info.height,
      duration: info.duration,
      fps: info.fps,
      hasAudio: info.hasAudio,
      inPoint: 0,
      outPoint: info.duration,
    }),

  unload: () => {
    const url = get().url
    if (url) URL.revokeObjectURL(url)
    set({ ...EMPTY })
  },

  setStatus: (status, error = null) => set({ status, error }),
  setPlaying: (playing) => set({ playing }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setRange: (inPoint, outPoint) => set({ inPoint, outPoint }),
  setLoop: (loop) => set({ loop }),
  setMaskPreview: (maskPreview) => set({ maskPreview }),
  setShowRaw: (showRaw) => set({ showRaw }),
  setStats: (stats) => set(stats),
}))

export function formatTimecode(seconds: number, fps: number): string {
  const total = Math.max(0, seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = Math.floor(total % 60)
  const f = Math.floor((total % 1) * fps)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}:${pad(f)}`
}
