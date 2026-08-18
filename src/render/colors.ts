import type { Params } from '../store/paramSchema'
import type { Track } from '../cv/types'

/** Hazır paletler — makine görüşü / CRT / askeri estetik. */
export const PALETTES: Record<string, readonly string[]> = {
  'mono-white': ['#ffffff', '#d0d0d0', '#a0a0a0'],
  'terminal-green': ['#00ff41', '#00c853', '#7cff8a', '#00e5a0'],
  'amber-crt': ['#ffb000', '#ff8c00', '#ffd166', '#ff6b00'],
  'cyan-magenta': ['#00e5ff', '#ff00e5', '#00ffc8', '#c800ff'],
  'hot-pink': ['#ff2d78', '#ff6ba8', '#ff0055', '#ffa6c9'],
  'military-olive': ['#a3b18a', '#588157', '#dad7cd', '#3a5a40'],
  y2k: ['#c0c0ff', '#8affff', '#ff9ee6', '#e0e0ff', '#9effc4'],
  infrared: ['#ff0033', '#ff7700', '#ffee00', '#ffffff'],
}

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m || !m[1]) return [255, 255, 255]
  const v = parseInt(m[1], 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

export function rgbaString(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`
}

function lerpHex(a: string, b: string, t: number): string {
  const ca = hexToRgb(a)
  const cb = hexToRgb(b)
  const mix = (i: number) => Math.round(ca[i]! + (cb[i]! - ca[i]!) * t)
  return `#${[mix(0), mix(1), mix(2)].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

/** 0..1 değerini palet boyunca yumuşak geçişle renge çevirir. */
function samplePalette(palette: readonly string[], t: number): string {
  if (palette.length === 0) return '#ffffff'
  if (palette.length === 1) return palette[0]!
  const x = Math.max(0, Math.min(0.999999, t)) * (palette.length - 1)
  const i = Math.floor(x)
  return lerpHex(palette[i]!, palette[i + 1]!, x - i)
}

export function hslHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const c = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)))
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

export interface ColorContext {
  /** Sahnedeki en büyük alan — by-area normalizasyonu için. */
  maxArea: number
  maxSpeed: number
  width: number
  frameIndex: number
}

/** Track rengini colorMode'a göre çözer. Aynı track her karede aynı rengi alır. */
export function trackColor(t: Track, p: Params, cx: ColorContext): string {
  const palette = PALETTES[p.palette] ?? PALETTES['terminal-green']!
  switch (p.colorMode) {
    case 'single':
      return p.accentColor
    case 'palette':
      return palette[t.colorIndex % palette.length]!
    case 'by-area':
      return samplePalette(palette, cx.maxArea > 0 ? t.area / cx.maxArea : 0)
    case 'by-velocity': {
      const speed = Math.hypot(t.velocity.x, t.velocity.y)
      return samplePalette(palette, cx.maxSpeed > 0 ? speed / cx.maxSpeed : 0)
    }
    case 'by-position':
      return hslHex(((t.centroid.x / Math.max(1, cx.width)) * 360) % 360, 0.85, 0.55)
    case 'rainbow':
      return hslHex((cx.frameIndex * p.colorCycleSpeed * 4 + t.colorIndex * 47) % 360, 0.9, 0.58)
  }
}
