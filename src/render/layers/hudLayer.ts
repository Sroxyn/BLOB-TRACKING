import type { Params } from '../../store/paramSchema'
import type { FrameResult } from '../../cv/types'
import type { ViewInfo } from '../types'
import { rgbaString } from '../colors'
import { getScratch } from '../scratch'
import { mulberry32 } from '../rng'

/**
 * HUD + grade katmanı.
 * · Köşe braketleri, timecode, kare no, blob sayısı, özel metin, REC noktası
 * · Scanline / grid / vignette / kromatik sapma / film grain
 *
 * Grade efektleri en sonda, global blend/opaklık grubunun DIŞINDA uygulanır;
 * aksi hâlde overlay blend modu bunları da bozardı.
 */
export function drawHud(
  ctx: CanvasRenderingContext2D,
  result: FrameResult | null,
  p: Params,
  view: ViewInfo,
  hudColor: string,
): void {
  const { width: w, height: h } = view
  const m = p.hudMargin
  const size = p.hudSize
  const a = p.hudOpacity

  /* ── grid ── */
  if (p.gridAmount > 0) {
    ctx.save()
    ctx.strokeStyle = rgbaString(hudColor, p.gridAmount * 0.35)
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let x = p.gridSize; x < w; x += p.gridSize) {
      ctx.moveTo(Math.round(x) + 0.5, 0)
      ctx.lineTo(Math.round(x) + 0.5, h)
    }
    for (let y = p.gridSize; y < h; y += p.gridSize) {
      ctx.moveTo(0, Math.round(y) + 0.5)
      ctx.lineTo(w, Math.round(y) + 0.5)
    }
    ctx.stroke()
    ctx.restore()
  }

  /* ── köşe braketleri ── */
  if (p.hudCorners) {
    const len = Math.min(w, h) * 0.06
    ctx.save()
    ctx.strokeStyle = rgbaString(hudColor, a)
    ctx.lineWidth = Math.max(1, size / 8)
    ctx.beginPath()
    ctx.moveTo(m, m + len)
    ctx.lineTo(m, m)
    ctx.lineTo(m + len, m)
    ctx.moveTo(w - m - len, m)
    ctx.lineTo(w - m, m)
    ctx.lineTo(w - m, m + len)
    ctx.moveTo(w - m, h - m - len)
    ctx.lineTo(w - m, h - m)
    ctx.lineTo(w - m - len, h - m)
    ctx.moveTo(m + len, h - m)
    ctx.lineTo(m, h - m)
    ctx.lineTo(m, h - m - len)
    ctx.stroke()
    ctx.restore()
  }

  /* ── metinler ── */
  ctx.save()
  ctx.font = `${size}px "JetBrains Mono", "Courier New", monospace`
  ctx.fillStyle = rgbaString(hudColor, a)
  ctx.textBaseline = 'top'
  const lh = size * 1.5
  const topLeft: string[] = []
  if (p.hudTimecode) topLeft.push(timecode(view.time, view.fps))
  if (p.hudFrameNumber) topLeft.push(`F ${String(view.frameIndex).padStart(5, '0')}`)
  if (p.hudText) topLeft.push(p.hudText)
  ctx.textAlign = 'left'
  topLeft.forEach((line, i) => ctx.fillText(line, m + size * 1.6, m + size * 0.4 + i * lh))

  if (p.hudBlobCount) {
    ctx.textAlign = 'right'
    const n = result ? (result.tracks.length || result.blobs.length) : 0
    ctx.fillText(`BLOBS ${String(n).padStart(2, '0')}`, w - m - size * 1.6, m + size * 0.4)
  }

  if (p.hudRecDot) {
    // 1 saniyelik periyotta yanıp söner — kare tabanlı, deterministik
    const on = Math.floor(view.frameIndex / Math.max(1, view.fps / 2)) % 2 === 0
    ctx.textAlign = 'left'
    ctx.fillStyle = rgbaString('#ff2d2d', on ? a : a * 0.15)
    ctx.beginPath()
    ctx.arc(m + size * 0.7, h - m - size * 0.7, size * 0.35, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = rgbaString(hudColor, a)
    ctx.textBaseline = 'middle'
    ctx.fillText('REC', m + size * 1.6, h - m - size * 0.6)
  }
  ctx.restore()

  /* ── scanline ── */
  if (p.scanlines > 0) {
    ctx.save()
    ctx.fillStyle = `rgba(0,0,0,${p.scanlines * 0.55})`
    const step = Math.max(2, p.scanlineSpacing)
    const thickness = Math.max(1, Math.floor(step / 2))
    for (let y = 0; y < h; y += step) ctx.fillRect(0, y, w, thickness)
    ctx.restore()
  }

  /* ── vignette ── */
  if (p.vignette > 0) {
    ctx.save()
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.hypot(w, h) * 0.62)
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(1, `rgba(0,0,0,${p.vignette})`)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    ctx.restore()
  }

  /* ── kromatik sapma (piksel uzayında — yalnızca > 0 iken) ── */
  if (p.chromaticAberration > 0) applyChromaticAberration(ctx, w, h, p.chromaticAberration)

  /* ── film grain (önceden üretilmiş döşeme) ── */
  if (p.filmGrain > 0) drawGrain(ctx, w, h, p.filmGrain, view.frameIndex)
}

function timecode(seconds: number, fps: number): string {
  const t = Math.max(0, seconds)
  const pad = (n: number) => String(Math.floor(n)).padStart(2, '0')
  return `${pad(t / 3600)}:${pad((t % 3600) / 60)}:${pad(t % 60)}:${pad((t % 1) * fps)}`
}

function applyChromaticAberration(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number): void {
  const d = Math.round(amount)
  if (d < 1) return
  const img = ctx.getImageData(0, 0, w, h)
  const src = new Uint8ClampedArray(img.data)
  const data = img.data
  for (let y = 0; y < h; y++) {
    const row = y * w
    for (let x = 0; x < w; x++) {
      const i = (row + x) * 4
      const xr = Math.min(w - 1, x + d)
      const xb = Math.max(0, x - d)
      data[i] = src[(row + xr) * 4]!
      data[i + 2] = src[(row + xb) * 4 + 2]!
    }
  }
  ctx.putImageData(img, 0, 0)
}

let grainTile: HTMLCanvasElement | null = null
function drawGrain(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, frameIndex: number): void {
  const TILE = 256
  if (!grainTile) {
    const g = getScratch('grainTile', TILE, TILE)
    const img = g.createImageData(TILE, TILE)
    const rand = mulberry32(12345)
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 128 + (rand() - 0.5) * 255
      img.data[i] = v
      img.data[i + 1] = v
      img.data[i + 2] = v
      img.data[i + 3] = 255
    }
    g.putImageData(img, 0, 0)
    grainTile = g.canvas
  }
  const rand = mulberry32(frameIndex * 2654435761)
  const ox = Math.floor(rand() * TILE)
  const oy = Math.floor(rand() * TILE)
  ctx.save()
  ctx.globalAlpha = amount * 0.5
  ctx.globalCompositeOperation = 'overlay'
  for (let y = -oy; y < h; y += TILE) {
    for (let x = -ox; x < w; x += TILE) ctx.drawImage(grainTile, x, y)
  }
  ctx.restore()
}
