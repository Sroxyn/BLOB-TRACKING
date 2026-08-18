/** CV katmanının veri tipleri. Hiçbiri DOM'a bağlı değildir. */

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Point {
  x: number
  y: number
}

/** İkili maske: 0 veya 255. */
export interface Mask {
  data: Uint8ClampedArray
  width: number
  height: number
}

/** Connected-components çıktısı (detection çözünürlüğünde piksel birimi). */
export interface RawBlob {
  label: number
  area: number
  bbox: Rect
  centroid: Point
  perimeter: number
  /** area / (bbox.w * bbox.h) — doluluk oranı */
  density: number
  /** bbox.w / bbox.h */
  aspect: number
  touchesEdge: boolean
  /** contourMode açıkken pipeline tarafından doldurulur. */
  contour?: Point[] | null
}

export type TrackState = 'tentative' | 'confirmed' | 'lost'

export interface Track {
  id: number
  /** idFormat uygulanmış görünen etiket. */
  label: string
  /** Ham ölçüm kutusu. */
  box: Rect
  /** Yumuşatılmış kutu — çizim bunu kullanır. */
  smoothBox: Rect
  centroid: Point
  /** px/kare */
  velocity: Point
  area: number
  /** Eşleşmeden geçen kare sayısı. */
  age: number
  hits: number
  totalFrames: number
  birthFrame: number
  /** Kaybolduğu kare (fade-out için), hâlâ görünüyorsa null. */
  lostSince: number | null
  state: TrackState
  trail: Point[]
  colorIndex: number
  /** contourMode açıkken doldurulur. */
  contour: Point[] | null
  /** 0..1 — eşleşme kalitesi ve yaşa göre güven. */
  confidence: number
}

export interface FrameResult {
  frameIndex: number
  time: number
  /** Koordinat uzayı: tüm blob/track koordinatları bu ölçekte. */
  detectionWidth: number
  detectionHeight: number
  mask: Mask | null
  blobs: RawBlob[]
  tracks: Track[]
  /** Pipeline süresi (ms). */
  msDetect: number
}

export function emptyFrameResult(frameIndex: number, time: number): FrameResult {
  return {
    frameIndex,
    time,
    detectionWidth: 0,
    detectionHeight: 0,
    mask: null,
    blobs: [],
    tracks: [],
    msDetect: 0,
  }
}
