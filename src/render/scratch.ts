/**
 * İsimli yardımcı canvas'lar. Katmanlar kare başına yeni canvas yaratmasın;
 * her katman kendi anahtarını kullanır ki aynı karede birbirini ezmesin.
 */
const canvases = new Map<string, HTMLCanvasElement>()

export function getScratch(key: string, w: number, h: number, readFrequently = false): CanvasRenderingContext2D {
  let c = canvases.get(key)
  if (!c) {
    c = document.createElement('canvas')
    canvases.set(key, c)
  }
  if (c.width !== w || c.height !== h) {
    c.width = w
    c.height = h
  }
  const ctx = c.getContext('2d', { willReadFrequently: readFrequently })
  if (!ctx) throw new Error('2d context unavailable')
  return ctx
}
