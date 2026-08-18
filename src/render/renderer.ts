import type { Params } from '../store/paramSchema'
import type { FrameResult, Track } from '../cv/types'
import { drawBackground } from './layers/backgroundLayer'
import { drawMaskOverlay } from './layers/maskLayer'
import { drawTrails } from './layers/trailLayer'
import { drawLinks } from './layers/linkLayer'
import { drawContours } from './layers/contourLayer'
import { drawBoxes } from './layers/boxLayer'
import { drawMarkers } from './layers/markerLayer'
import { drawLabels } from './layers/labelLayer'
import { drawHud } from './layers/hudLayer'
import { trackColor } from './colors'
import type { Drawable, ViewInfo } from './types'

export type { ViewInfo } from './types'

/**
 * renderFrame — önizleme ve export'un ORTAK çizim yolu.
 * Aynı fonksiyon her iki tarafta da çağrıldığı için çıktı WYSIWYG'dir.
 *
 * Çizim sırası (alttan üste):
 *   background → mask → trail → link → contour → box → marker → label → HUD/grade
 *
 * Not: spesifikasyondaki bölüm sırasından bilinçli bir sapma var — izler ve
 * bağlantılar kutuların ALTINDA, etiketler en üstte çiziliyor. Aksi hâlde
 * bağlantı çizgileri etiketlerin üstünden geçip okunmaz hâle getiriyor.
 *
 * Global blendMode ve globalOpacity yalnızca overlay grubuna uygulanır;
 * arka plan ve grade efektleri bunun dışındadır.
 */
export function renderFrame(
  ctx: CanvasRenderingContext2D,
  video: CanvasImageSource | null,
  result: FrameResult | null,
  p: Params,
  view: ViewInfo,
): void {
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, view.width, view.height)
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1

  if (!view.overlayOnly) drawBackground(ctx, video, result, p, view)
  drawMaskOverlay(ctx, result, p, view)

  const items = result ? buildDrawables(result, p, view) : []

  if (items.length > 0 && p.globalOpacity > 0) {
    ctx.save()
    ctx.globalAlpha = p.globalOpacity
    ctx.globalCompositeOperation = p.blendMode as GlobalCompositeOperation
    drawTrails(ctx, items, p, view)
    drawLinks(ctx, items, p, view)
    drawContours(ctx, items, p, view)
    drawBoxes(ctx, items, p, view)
    drawMarkers(ctx, items, p, view)
    drawLabels(ctx, items, p, view)
    ctx.restore()
  }

  const hudColor = p.colorMode === 'single' ? p.accentColor : (items[0]?.color ?? p.accentColor)
  drawHud(ctx, result, p, view, hudColor)

  ctx.restore()
}

/**
 * Track'leri çizim uzayına hazırlar: ölçek, padding, kare zorlama, nefes
 * animasyonu, renk ve doğum/kaybolma opaklığı tek yerde hesaplanır.
 */
export function buildDrawables(result: FrameResult, p: Params, view: ViewInfo): Drawable[] {
  const source: Track[] = result.tracks.length > 0 ? result.tracks : blobsAsTracks(result)
  let maxArea = 0
  let maxSpeed = 0
  for (const t of source) {
    if (t.area > maxArea) maxArea = t.area
    const s = Math.hypot(t.velocity.x, t.velocity.y)
    if (s > maxSpeed) maxSpeed = s
  }
  const colorCtx = { maxArea, maxSpeed, width: view.width, frameIndex: view.frameIndex }
  const pulse =
    p.boxPulseAmount > 0 ? 1 + Math.sin((view.frameIndex / view.fps) * p.boxPulseSpeed * Math.PI * 2) * p.boxPulseAmount : 1

  const out: Drawable[] = []
  source.forEach((t, index) => {
    const alpha = lifeAlpha(t, p, view.frameIndex)
    if (alpha <= 0.004) return

    const box = t.smoothBox
    let x = box.x * view.scaleX
    let y = box.y * view.scaleY
    let w = box.w * view.scaleX
    let h = box.h * view.scaleY

    if (p.boxSquare) {
      const side = Math.max(w, h)
      x -= (side - w) / 2
      y -= (side - h) / 2
      w = side
      h = side
    }
    x -= p.boxPadding
    y -= p.boxPadding
    w += p.boxPadding * 2
    h += p.boxPadding * 2

    // doğum animasyonu ve nefes efekti kutuyu merkezden ölçekler
    const spawn = spawnScale(t, p, view.frameIndex)
    const scale = pulse * spawn
    if (scale !== 1) {
      const cx = x + w / 2
      const cy = y + h / 2
      w *= scale
      h *= scale
      x = cx - w / 2
      y = cy - h / 2
    }

    out.push({
      track: t,
      rect: { x, y, w: Math.max(1, w), h: Math.max(1, h) },
      cx: t.centroid.x * view.scaleX,
      cy: t.centroid.y * view.scaleY,
      color: trackColor(t, p, colorCtx),
      alpha,
      vx: t.velocity.x * view.scaleX,
      vy: t.velocity.y * view.scaleY,
      index,
    })
  })
  return out
}

/** Tracking kapalıyken blob'lar geçici track gibi çizilir (ID'siz). */
function blobsAsTracks(result: FrameResult): Track[] {
  return result.blobs.map((b, i) => ({
    id: i + 1,
    label: String(i + 1),
    box: b.bbox,
    smoothBox: b.bbox,
    centroid: b.centroid,
    velocity: { x: 0, y: 0 },
    area: b.area,
    age: 0,
    hits: 1,
    totalFrames: 1,
    birthFrame: result.frameIndex,
    lostSince: null,
    state: 'confirmed' as const,
    trail: [],
    colorIndex: i,
    contour: b.contour ?? null,
    confidence: 1,
  }))
}

/** Doğum (fade-in) ve kaybolma (fade-out) opaklığı. */
function lifeAlpha(t: Track, p: Params, frameIndex: number): number {
  let alpha = 1
  if (p.spawnDuration > 0) {
    const since = frameIndex - t.birthFrame
    if (since < p.spawnDuration) alpha *= easeOut(Math.max(0, since) / p.spawnDuration)
  }
  if (p.fadeOut > 0 && t.age > p.persistence) {
    alpha *= Math.max(0, 1 - (t.age - p.persistence) / p.fadeOut)
  }
  return alpha
}

function spawnScale(t: Track, p: Params, frameIndex: number): number {
  if (p.spawnDuration <= 0) return 1
  const since = frameIndex - t.birthFrame
  if (since >= p.spawnDuration) return 1
  return 0.78 + 0.22 * easeOut(Math.max(0, since) / p.spawnDuration)
}

function easeOut(t: number): number {
  const x = Math.max(0, Math.min(1, t))
  return 1 - Math.pow(1 - x, 3)
}
