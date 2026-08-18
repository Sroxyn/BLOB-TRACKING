import type { Params } from '../store/paramSchema'
import type { FrameResult } from '../cv/types'

/** Ana thread ↔ CV worker mesaj sözleşmesi. */

export interface ProcessRequest {
  type: 'process'
  id: number
  /** Detection çözünürlüğüne indirilmiş kare (transferable). */
  bitmap: ImageBitmap
  width: number
  height: number
  frameIndex: number
  time: number
  params: Params
  /** detection genişliği / kaynak genişliği */
  scale: number
  fps: number
  /** Maske geri gönderilsin mi (maske görünmüyorsa boşuna kopyalama). */
  needMask: boolean
}

export interface ControlRequest {
  type: 'reset' | 'freezeBackground'
  id: number
}

export type WorkerRequest = ProcessRequest | ControlRequest

export interface ProcessResponse {
  type: 'result'
  id: number
  result: FrameResult
  /** Worker içinde geçen toplam süre (bitmap çizimi + pipeline). */
  msWorker: number
}

export interface AckResponse {
  type: 'ack'
  id: number
}

export interface ErrorResponse {
  type: 'error'
  id: number
  message: string
}

export type WorkerResponse = ProcessResponse | AckResponse | ErrorResponse

/** Maskenin worker'dan geri gönderilmesi gerekiyor mu? */
export function needsMask(p: Params, maskPreview: boolean): boolean {
  return (
    maskPreview ||
    p.maskOverlay ||
    p.backgroundMode === 'mask' ||
    p.backgroundMode === 'maskColored'
  )
}
