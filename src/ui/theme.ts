/** UI vurgu rengi: kullanıcı çok koyu bir renk seçse de arayüz okunabilir kalsın. */
export function readableAccent(hex: string): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return '#00ff41'
  const [h, s, l] = rgbToHsl(rgb[0], rgb[1], rgb[2])
  return hslToCss(h, Math.max(s, 0.35), Math.min(0.75, Math.max(0.5, l)))
}

export function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m || !m[1]) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return [0, 0, l]
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
  else if (max === gn) h = ((bn - rn) / d + 2) / 6
  else h = ((rn - gn) / d + 4) / 6
  return [h * 360, s, l]
}

export function hslToCss(h: number, s: number, l: number): string {
  return `hsl(${h.toFixed(1)} ${(s * 100).toFixed(1)}% ${(l * 100).toFixed(1)}%)`
}
