/**
 * VideoEngine — tek bir <video> öğesinin imperatif sahibi.
 *
 * · Kare olayları `requestVideoFrameCallback` ile alınır (yoksa rAF'a düşer).
 * · Kaynak fps, ardışık `mediaTime` farklarının medyanından ölçülür ve
 *   yaygın hızlara (23.976 … 60) %2 toleransla oturtulur.
 * · Kare kare gezinme, kare merkezine seek ederek yapılır: t = (i + 0.5) / fps.
 *   Böylece yuvarlama hatası bir önceki kareye düşmez.
 *
 * React'in dışında durur; bileşenler yalnızca abone olur.
 */

export interface VideoFrameMeta {
  mediaTime: number
  presentedFrames: number
}

type RVFCVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: VideoFrameMeta) => void) => number
  cancelVideoFrameCallback?: (handle: number) => void
}

export type FrameListener = (time: number, frameIndex: number) => void

const COMMON_RATES = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 100, 120]

function snapRate(rate: number): number {
  for (const r of COMMON_RATES) {
    if (Math.abs(rate - r) / r < 0.02) return r
  }
  return Math.round(rate * 1000) / 1000
}

export class VideoEngine {
  readonly el: RVFCVideo
  fps = 30
  /** fps ölçümü tamamlanana kadar false. */
  fpsLocked = false

  private listeners = new Set<FrameListener>()
  private rvfcHandle: number | null = null
  private rafHandle: number | null = null
  private deltas: number[] = []
  private lastMediaTime = -1
  private lastEmit = -1
  private inPoint = 0
  private outPoint = Infinity
  private loop = true
  private disposed = false
  private loadToken = 0

  constructor() {
    const el = document.createElement('video') as RVFCVideo
    el.playsInline = true
    el.preload = 'auto'
    el.crossOrigin = 'anonymous'
    el.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none'
    document.body.appendChild(el)
    this.el = el
    this.el.addEventListener('seeked', this.emitNow)
    this.el.addEventListener('timeupdate', this.onTimeUpdate)
    this.startFrameLoop()
  }

  /**
   * Yeni kaynak yükler ve meta verisi hazır olunca çözülür.
   *
   * Her yükleme bir jetonla işaretlenir: önceki kaynağın geciken `error`
   * olayları (özellikle object URL iptal edildikten sonra gelenler) yeni
   * yüklemeyi düşürmesin.
   */
  load(url: string): Promise<{ width: number; height: number; duration: number }> {
    const token = ++this.loadToken
    this.pause()
    this.reset()
    return new Promise((resolve, reject) => {
      const el = this.el
      const onMeta = () => {
        if (token !== this.loadToken) return
        cleanup()
        // Kaynak değişimi bekleyen video-frame callback'lerini iptal eder; yeniden kur.
        this.startFrameLoop()
        resolve({ width: el.videoWidth, height: el.videoHeight, duration: el.duration })
      }
      const onErr = () => {
        if (token !== this.loadToken) return
        cleanup()
        reject(new Error('video decode error'))
      }
      const cleanup = () => {
        el.removeEventListener('loadedmetadata', onMeta)
        el.removeEventListener('error', onErr)
      }
      el.addEventListener('loadedmetadata', onMeta)
      el.addEventListener('error', onErr)
      // Önce eski kaynağı bırak: iptal edilmiş bir blob URL'i bağlıyken
      // load() çağırmak bazı tarayıcılarda hemen hata olayı üretiyor.
      el.removeAttribute('src')
      el.load()
      el.src = url
      el.load()
    })
  }

  /** Kaynağı bırakır; motor canlı kalır (yeni video yüklenebilir). */
  unload(): void {
    this.loadToken++
    this.pause()
    this.reset()
    this.lastEmit = -1
    this.el.removeAttribute('src')
    this.el.load()
  }

  reset() {
    this.deltas = []
    this.lastMediaTime = -1
    this.fps = 30
    this.fpsLocked = false
    this.inPoint = 0
    this.outPoint = Infinity
  }

  subscribe(cb: FrameListener): () => void {
    this.listeners.add(cb)
    return () => {
      this.listeners.delete(cb)
    }
  }

  setRange(inPoint: number, outPoint: number) {
    this.inPoint = inPoint
    this.outPoint = outPoint
  }

  setLoop(loop: boolean) {
    this.loop = loop
  }

  get playing(): boolean {
    return !this.el.paused && !this.el.ended
  }

  get frameIndex(): number {
    return this.timeToFrame(this.el.currentTime)
  }

  get frameCount(): number {
    const d = this.el.duration
    return Number.isFinite(d) ? Math.max(1, Math.round(d * this.fps)) : 0
  }

  timeToFrame(t: number): number {
    return Math.max(0, Math.round(t * this.fps - 0.5))
  }

  frameToTime(i: number): number {
    return (i + 0.5) / this.fps
  }

  async play() {
    if (this.el.currentTime >= this.outPoint - 1e-4) await this.seek(this.inPoint)
    try {
      await this.el.play()
    } catch {
      /* kullanıcı etkileşimi gerekebilir */
    }
  }

  pause() {
    this.el.pause()
  }

  async toggle() {
    if (this.playing) this.pause()
    else await this.play()
  }

  /**
   * Belirtilen zamana gider ve kare gerçekten hazır olunca çözülür.
   *
   * Aynı konuma seek istendiğinde bazı tarayıcılar 'seeked' üretmez; bu yüzden
   * zaman aşımı ağı var. Aksi hâlde yükleme akışı burada askıda kalır ve ilk
   * kare hiç çizilmez.
   */
  seek(time: number): Promise<void> {
    const el = this.el
    const duration = Number.isFinite(el.duration) ? el.duration : time
    const target = Math.max(0, Math.min(duration - 1e-3, time))
    if (Math.abs(el.currentTime - target) < 1e-4 && el.readyState >= 2) return Promise.resolve()
    return new Promise((resolve) => {
      let settled = false
      const done = () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        el.removeEventListener('seeked', done)
        resolve()
      }
      const timer = setTimeout(done, 2000)
      el.addEventListener('seeked', done)
      el.currentTime = target
    })
  }

  /** delta kare ileri/geri. Oynatma sırasında önce durdurur. */
  async step(delta: number): Promise<void> {
    this.pause()
    const next = Math.max(0, this.frameIndex + delta)
    await this.seek(this.frameToTime(next))
  }

  async seekFrame(index: number): Promise<void> {
    await this.seek(this.frameToTime(index))
  }

  /** Parametre değişimi gibi durumlarda mevcut kareyi yeniden yayınlar. */
  emitNow = () => {
    this.lastEmit = -1
    this.emit(this.el.currentTime)
  }

  private emit(time: number) {
    if (time === this.lastEmit) return
    this.lastEmit = time
    for (const cb of this.listeners) cb(time, this.timeToFrame(time))
  }

  dispose() {
    this.disposed = true
    if (this.rvfcHandle !== null) this.el.cancelVideoFrameCallback?.(this.rvfcHandle)
    if (this.rafHandle !== null) cancelAnimationFrame(this.rafHandle)
    this.el.removeEventListener('seeked', this.emitNow)
    this.el.removeEventListener('timeupdate', this.onTimeUpdate)
    this.el.removeAttribute('src')
    this.el.load()
    this.el.remove()
    this.listeners.clear()
  }

  /* ── iç işleyiş ─────────────────────────────────────────────────────── */

  /**
   * Üçüncü emniyet ağı: rVFC ve rAF'ın ikisi de bastırıldığında (arka plan
   * sekmesi, compositing kapalı) 'timeupdate' saniyede ~4 kez gelir ve
   * önizlemenin tamamen donmasını engeller.
   */
  private onTimeUpdate = () => {
    this.checkRange()
    if (this.playing) this.emit(this.el.currentTime)
  }

  private checkRange = () => {
    if (!this.playing) return
    if (this.el.currentTime >= this.outPoint - 1e-3) {
      if (this.loop) {
        void this.seek(this.inPoint)
      } else {
        this.pause()
      }
    }
  }

  private startFrameLoop() {
    const el = this.el
    if (this.rvfcHandle !== null) {
      el.cancelVideoFrameCallback?.(this.rvfcHandle)
      this.rvfcHandle = null
    }
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle)
      this.rafHandle = null
    }
    // Birincil yol: requestVideoFrameCallback (kare-doğru, presented frame başına bir kez).
    if (typeof el.requestVideoFrameCallback === 'function') {
      const tick = (_now: number, meta: VideoFrameMeta) => {
        if (this.disposed) return
        this.rvfcHandle = el.requestVideoFrameCallback!(tick)
        this.measure(meta.mediaTime)
        this.checkRange()
        this.emit(meta.mediaTime)
      }
      this.rvfcHandle = el.requestVideoFrameCallback(tick)
    }
    // Emniyet ağı: rVFC bazı ortamlarda (arka plan sekmesi, compositing kapalı)
    // hiç tetiklenmez. rAF döngüsü yalnızca oynatma sırasında ve zaman
    // değiştiyse yayınlar; rVFC çalışıyorsa emit() zaten yinelenenleri eler.
    const raf = () => {
      if (this.disposed) return
      this.rafHandle = requestAnimationFrame(raf)
      if (!this.playing) return
      const t = el.currentTime
      if (t === this.lastEmit) return
      this.measure(t)
      this.checkRange()
      this.emit(t)
    }
    this.rafHandle = requestAnimationFrame(raf)
  }

  /** Ardışık kare zamanlarının medyanından fps tahmini. */
  private measure(mediaTime: number) {
    if (this.fpsLocked || !this.playing) {
      this.lastMediaTime = mediaTime
      return
    }
    if (this.lastMediaTime >= 0) {
      const d = mediaTime - this.lastMediaTime
      if (d > 1 / 400 && d < 1 / 5) this.deltas.push(d)
    }
    this.lastMediaTime = mediaTime
    if (this.deltas.length >= 24) {
      const sorted = [...this.deltas].sort((a, b) => a - b)
      const mid = sorted[Math.floor(sorted.length / 2)] ?? 1 / 30
      this.fps = snapRate(1 / mid)
      this.fpsLocked = true
    }
  }
}

export const videoEngine = new VideoEngine()
