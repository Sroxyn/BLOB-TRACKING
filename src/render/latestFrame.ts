import type { FrameResult } from '../cv/types'

/**
 * Son CV sonucunun paylaşıldığı küçük kayıt.
 *
 * Preset seçicideki canlı küçük önizlemeler, mevcut karenin tespit sonucunu
 * yeniden kullanır: tek bir CV geçişi, N preset için N ucuz çizim. Aboneler
 * yeni kare geldiğinde haberdar olur.
 */
let latest: FrameResult | null = null
const listeners = new Set<() => void>()

export function setLatestFrame(result: FrameResult | null): void {
  latest = result
  for (const cb of listeners) cb()
}

export function getLatestFrame(): FrameResult | null {
  return latest
}

export function subscribeLatestFrame(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}
