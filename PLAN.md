# PLAN.md — Blob Track Studio

TouchDesigner **Blob Track TOP** estetiğini tarayıcıya taşıyan, %100 client-side video
overlay stüdyosu. Sunucu yok, upload yok, hesap yok.

---

## 1. Mimari Kararlar

### 1.1 Katmanlı ayrım
```
[UI / React]  →  parametreler (Zustand)  →  [CV Pipeline (saf TS)]  →  Frame sonucu
                                                     ↓
                                        [Render (Canvas 2D, saf fonksiyonlar)]
```
- **CV modülleri DOM'a dokunmaz.** Girdi: `Uint8ClampedArray` + `width/height` + params.
  Çıktı: düz veri (`Blob[]`, `Mask`). Bu sayede worker'da da, testte de, node'da da çalışır.
- **Render modülleri** yalnızca `CanvasRenderingContext2D` + `FrameResult` + `Params` alır.
  Böylece aynı çizim kodu hem önizleme hem export için kullanılır → WYSIWYG garantisi.
- **Worker sınırı** `pipeline.ts` seviyesinde. Worker'a giden: `ImageData` (transferable),
  `DetectionParams`, `frameIndex`. Dönen: `FrameResult` (+ maske buffer'ı transferable).

### 1.2 Parametre sistemi (tek doğru kaynak)
`src/store/paramSchema.ts` içindeki `PARAM_SCHEMA` tek gerçeğin kaynağıdır.
Her parametre `{ kind, label, group, default, min/max/step | options }` metadata'sı taşır.
- `Params` TypeScript tipi bu şemadan **türetilir** (`as const satisfies` + mapped type).
  Yani şemaya satır eklemek = yeni tipli parametre + otomatik UI + presetlerde otomatik alan.
- UI (`ControlPanel`) şemayı gezip kontrolü kendi üretir; elle yüzlerce slider yazılmaz.
- `showIf` alanı ile koşullu görünürlük (ör. `keyColor` sadece `sourceMode === 'chroma'` iken).

### 1.3 Determinizm
Önizleme ve export **aynı** `pipeline()` + `renderFrame()` çağrılarını kullanır.
Export gerçek zamanlı ekran kaydı değil, kare kare seek + encode (WebCodecs) yoluyla yapılır.
Rastgelelik (grain, jitter, glitch) `frameIndex` tabanlı deterministik PRNG (mulberry32) ile
üretilir → aynı kare her zaman aynı görünür.

### 1.4 Bellek
`BufferPool` (src/cv/pool.ts): `Uint8ClampedArray`/`Int32Array`/`Float32Array` havuzu.
Kare başına allocation yok; pipeline tüm ara buffer'ları havuzdan kiralar.

---

## 2. Modül Arayüzleri (tip imzaları)

### 2.1 `src/cv/types.ts`
```ts
export interface Rect { x: number; y: number; w: number; h: number }
export interface Point { x: number; y: number }

export interface Mask {            // binary görüntü, 0 | 255
  data: Uint8ClampedArray;         // length = w*h
  width: number; height: number;
}

export interface RawBlob {         // connected components çıktısı
  label: number;
  area: number;                    // px (detection çözünürlüğünde)
  bbox: Rect;
  centroid: Point;
  perimeter: number;
  density: number;                 // area / (bbox.w*bbox.h)
  aspect: number;                  // bbox.w / bbox.h
  touchesEdge: boolean;
}

export interface Track {
  id: number;
  label: string;                   // idFormat uygulanmış hâli
  box: Rect;                       // ham ölçüm
  smoothBox: Rect;                 // One Euro filtrelenmiş
  centroid: Point;                 // smoothBox merkezi
  velocity: Point;                 // px/frame (normalize edilmiş uzayda)
  area: number;
  age: number;                     // eşleşmeden geçen kare
  hits: number;
  totalFrames: number;
  birthFrame: number;
  deathFrame: number | null;       // fade-out için
  state: 'tentative' | 'confirmed' | 'lost';
  trail: Point[];
  colorIndex: number;              // deterministik palet indeksi
  contour?: Point[];               // istenirse
}

export interface FrameResult {
  frameIndex: number;
  time: number;
  detectionWidth: number;          // koordinat uzayı (render ölçekler)
  detectionHeight: number;
  mask: Mask | null;               // maskPreview veya mask katmanı açıksa
  blobs: RawBlob[];
  tracks: Track[];
  msDetect: number;
}
```

### 2.2 CV fonksiyonları (hepsi saf)
```ts
// preprocess.ts
downscale(src: ImageData, w: number, h: number, pool: BufferPool): ImageData
toGray(src: ImageData, out: Uint8ClampedArray): void
boxBlur3(src: Uint8ClampedArray, out: Uint8ClampedArray, w: number, h: number, r: number): void
levels(buf: Uint8ClampedArray, brightness: number, contrast: number, gamma: number, invert: boolean): void

// threshold.ts
binarize(ctx: ThresholdContext, p: DetectionParams, out: Uint8ClampedArray): void
//   sourceMode: 'luminance' | 'chroma' | 'diff' | 'background' | 'edge'
//   ThresholdContext { gray, rgba, prevGray, bgModel, w, h }

// morphology.ts
erode(src, dst, w, h, k): void;  dilate(src, dst, w, h, k): void
open(buf, tmp, w, h, k, iter): void;  close(buf, tmp, w, h, k, iter): void

// connectedComponents.ts
labelBlobs(mask: Uint8ClampedArray, w: number, h: number, pool: BufferPool): RawBlob[]
//   iki geçişli union-find, 8-komşuluk

// contours.ts
traceContour(mask, w, h, start: Point): Point[]        // Moore-neighbor
convexHull(pts: Point[]): Point[]                       // Andrew monotone chain
simplify(pts: Point[], epsilon: number): Point[]        // Douglas–Peucker

// tracker.ts
class Tracker {
  update(blobs: RawBlob[], frameIndex: number, p: TrackingParams, dims: {w,h}): Track[]
  reset(): void
}
hungarian(cost: Float64Array, rows: number, cols: number): Int32Array   // -1 = atanmadı

// pipeline.ts
class Pipeline {
  process(frame: ImageData, frameIndex: number, time: number, p: Params): FrameResult
  reset(): void            // seek/parametre değişiminde geçmişi temizler
  freezeBackground(): void
}
```

### 2.3 Render
```ts
// renderer.ts
renderFrame(ctx: CanvasRenderingContext2D, video: CanvasImageSource | null,
            result: FrameResult, p: Params, view: ViewInfo): void
interface ViewInfo { width: number; height: number; scaleX: number; scaleY: number;
                     time: number; frameIndex: number; fps: number; overlayOnly: boolean }
// her katman: (ctx, result, p, view) => void
```

### 2.4 Export
```ts
interface ExportJob { start: number; end: number; fps: number; width: number; height: number; ... }
exportWebCodecs(job, hooks: { onProgress(f,total): void; signal: AbortSignal }): Promise<Blob>
exportMediaRecorder(job, hooks): Promise<Blob>
exportPngZip(job, hooks): Promise<Blob>
telemetryJSON(frames: FrameResult[]): string
telemetryCSV(frames: FrameResult[]): string
```

---

## 3. Milestone Planı

| # | Milestone | Durum |
|---|-----------|-------|
| 1 | İskelet: Vite+TS+Tailwind, param şeması/store, boş viewport, panel otomasyonu | ✅ |
| 2 | Video I/O: drag&drop, `<video>`, timeline, scrub, kare kare | ✅ |
| 3 | CV çekirdeği: preprocess→threshold→morphology→CC + mask preview | ✅ |
| 4 | Tracker: Hungarian, ID sürekliliği, One Euro + Vitest | ✅ |
| 5 | Render katmanları: box/marker/label/link/trail/contour/HUD | ✅ |
| 6 | Worker'a taşıma + performans doğrulaması | ✅ |
| 7 | Export: WebCodecs + ses + PNG seq + CSV/JSON + fallback | ✅ |
| 8 | Preset & cila: 8 preset, undo/redo, kısayollar, URL paylaşımı, mobil | ✅ |

---

## 4. Riskler ve Karşılıkları

| Risk | Karşılık |
|---|---|
| Kare kare seek yavaş/kaymalı | `requestVideoFrameCallback` önceliği, yoksa `currentTime` + `seeked` + tolerans kontrolü |
| WebCodecs yok (Safari eski) | `MediaRecorder` fallback + kullanıcıya net uyarı |
| Ses aktarımı | Orijinal dosyadan `AudioDecoder`→`AudioEncoder` (AAC/Opus); olmazsa video-only + uyarı |
| Worker'a `ImageData` kopyalama maliyeti | Detection çözünürlüğünde (0.35×) transferable gönderim |
| Parametre patlaması (UI karmaşası) | Şema tabanlı otomatik UI + `showIf` ile koşullu görünürlük + bölüm katlama |
