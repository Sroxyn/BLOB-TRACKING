import type { FrameResult } from '../cv/types'
import type { ExportJob } from './types'
import { outputFileName } from './types'

/**
 * Telemetri — After Effects / TouchDesigner'a taşımak için kare kare veri.
 *
 * Koordinatlar ÇIKTI çözünürlüğüne ölçeklenir; yani JSON/CSV'deki x,y,w,h
 * doğrudan export edilen videonun piksel uzayındadır.
 */

export interface TelemetryBlob {
  id: number
  label: string
  x: number
  y: number
  w: number
  h: number
  cx: number
  cy: number
  area: number
  vx: number
  vy: number
  state: string
  conf: number
}

export interface TelemetryFrame {
  frame: number
  time: number
  blobs: TelemetryBlob[]
}

export interface TelemetryCollector {
  push: (result: FrameResult, outFrame: number, time: number) => void
  frames: TelemetryFrame[]
  meta: { width: number; height: number; fps: number; frameCount: number }
}

export function collectTelemetry(job: ExportJob, width: number, height: number, fps: number): TelemetryCollector {
  const frames: TelemetryFrame[] = []
  const enabled = job.settings.telemetry !== 'none'
  return {
    frames,
    meta: { width, height, fps, frameCount: 0 },
    push(result, outFrame, time) {
      this.meta.frameCount = outFrame + 1
      if (!enabled) return
      const sx = width / Math.max(1, result.detectionWidth)
      const sy = height / Math.max(1, result.detectionHeight)
      const round = (n: number) => Math.round(n * 100) / 100
      const source = result.tracks.length > 0 ? result.tracks : []
      const blobs: TelemetryBlob[] = source.map((t) => ({
        id: t.id,
        label: t.label,
        x: round(t.smoothBox.x * sx),
        y: round(t.smoothBox.y * sy),
        w: round(t.smoothBox.w * sx),
        h: round(t.smoothBox.h * sy),
        cx: round(t.centroid.x * sx),
        cy: round(t.centroid.y * sy),
        area: Math.round(t.area * sx * sy),
        vx: round(t.velocity.x * sx),
        vy: round(t.velocity.y * sy),
        state: t.state,
        conf: round(t.confidence),
      }))
      if (blobs.length === 0 && result.blobs.length > 0) {
        // Tracking kapalıysa ham blob'ları yaz (ID = sıra numarası)
        result.blobs.forEach((b, i) => {
          blobs.push({
            id: i + 1,
            label: String(i + 1),
            x: round(b.bbox.x * sx),
            y: round(b.bbox.y * sy),
            w: round(b.bbox.w * sx),
            h: round(b.bbox.h * sy),
            cx: round(b.centroid.x * sx),
            cy: round(b.centroid.y * sy),
            area: Math.round(b.area * sx * sy),
            vx: 0,
            vy: 0,
            state: 'blob',
            conf: 1,
          })
        })
      }
      frames.push({ frame: outFrame, time: round(time * 1000) / 1000, blobs })
    },
  }
}

export function telemetryJSON(c: TelemetryCollector): string {
  return JSON.stringify({ meta: c.meta, frames: c.frames })
}

export function telemetryCSV(c: TelemetryCollector): string {
  const rows: string[] = ['frame,time,id,label,x,y,w,h,cx,cy,area,vx,vy,state,conf']
  for (const f of c.frames) {
    for (const b of f.blobs) {
      rows.push(
        `${f.frame},${f.time},${b.id},${b.label},${b.x},${b.y},${b.w},${b.h},${b.cx},${b.cy},${b.area},${b.vx},${b.vy},${b.state},${b.conf}`,
      )
    }
  }
  return rows.join('\n')
}

export function telemetryFiles(job: ExportJob, c: TelemetryCollector): { blob: Blob; fileName: string }[] {
  const mode = job.settings.telemetry
  if (mode === 'none' || c.frames.length === 0) return []
  const out: { blob: Blob; fileName: string }[] = []
  if (mode === 'json' || mode === 'both') {
    out.push({
      blob: new Blob([telemetryJSON(c)], { type: 'application/json' }),
      fileName: outputFileName(job, 'json'),
    })
  }
  if (mode === 'csv' || mode === 'both') {
    out.push({
      blob: new Blob([telemetryCSV(c)], { type: 'text/csv' }),
      fileName: outputFileName(job, 'csv'),
    })
  }
  return out
}
