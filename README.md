# BLOB·TRACK STUDIO

TouchDesigner'ın **Blob Track TOP** estetiğini tarayıcıya taşıyan, tamamen
client-side bir video overlay stüdyosu. Video yüklenir, hareketli/parlak/keylenmiş
bölgeler blob olarak bulunur, kareler arası stabil ID ile takip edilir, üzerine
machine-vision overlay çizilir ve sonuç video olarak dışa aktarılır.

**Hiçbir dosya sunucuya yüklenmez.** Tüm işlem `<video>` + Canvas + Web Worker +
WebCodecs ile tarayıcıda olur. Backend, hesap, veritabanı yok.

---

## Çalıştırma

```bash
npm install
npm run dev
```

| komut | iş |
|---|---|
| `npm run dev` | geliştirme sunucusu |
| `npm run build` | üretim derlemesi (`dist/`) |
| `npm test` | Vitest birim testleri (CV çekirdeği + tracker) |
| `npm run lint` | oxlint |

Tarayıcı gereksinimi: Chromium tabanlı tarayıcılar tam destekler (WebCodecs +
OffscreenCanvas). WebCodecs yoksa export `MediaRecorder`'a, worker yoksa CV ana
thread'e düşer — uygulama çalışmaya devam eder, kullanıcı uyarılır.

---

## Kısayollar

| tuş | iş |
|---|---|
| `Space` | oynat / duraklat |
| `←` `→` | kare kare (Shift: 10 kare) |
| `Home` `End` | in / out noktasına git |
| `I` `O` | in / out noktası işaretle |
| `L` | döngü |
| `M` | maske önizlemesi |
| `\` (basılı) | ham video (A/B karşılaştırma) |
| `P` | preset seçici (kategorili, önizlemeli) |
| `1`–`9` | ilk dokuz preseti doğrudan uygula |
| `E` | export penceresi · `Esc` kapat |
| `R` | parametreleri sıfırla |
| `Ctrl+Z` / `Ctrl+Shift+Z` | geri / ileri |

Slider'lar: sürükle · `Shift` ince ayar · çift tıkla varsayılan · sayı yaz ·
ok tuşları. Hover'daki kilit ikonu parametreyi randomize'dan korur.

---

## Mimari

```
UI (React)  →  parametreler (Zustand)  →  CV pipeline (saf TS, Web Worker)
                                              ↓
                                   render katmanları (Canvas 2D)
                                              ↓
                              önizleme  ·  export (WebCodecs)
```

- **Tek doğru kaynak:** [`src/store/paramSchema.ts`](src/store/paramSchema.ts) —
  145 parametrenin metadata'sı. `Params` tipi bu şemadan türetilir, Control Panel
  buradan **otomatik üretilir**, presetler/URL paylaşımı/randomize aynı şemayı kullanır.
- **CV katmanı saftır:** `src/cv/*` DOM'a dokunmaz, girdi/çıktı düz veridir →
  worker'da da, testte de, node'da da çalışır. OpenCV.js kullanılmaz; tüm
  algoritmalar typed array üzerinde sıfırdan yazılmıştır.
- **Önizleme ve export aynı `renderFrame()`'i çağırır** → WYSIWYG garantisi.
- **Determinizm:** grain/jitter gibi rastgelelikler kare indeksinden tohumlanır;
  aynı kare her zaman aynı görünür. Zamansal modlar (frame difference, background
  subtraction) ve tracker, aynı karenin yeniden işlenmesinde durumu anlık
  görüntüden geri yükler.

Ayrıntılı mimari kararlar, modül arayüzleri ve milestone geçmişi:
[PLAN.md](PLAN.md).

---

## Yetenekler

**Tespit** — 5 kaynak modu (luminance, chroma key, frame difference, background
subtraction, edge), adaptif eşik, histerezis, morfoloji (open/close), blob
filtreleri (alan, boyut, en-boy, kenar teması, birleştirme).

**Takip** — Hungarian eşleştirme (mesafe + IoU + alan maliyeti), occlusion
boyunca tahminle kayma, One Euro yumuşatma, 6 ID biçimi, doğum/kaybolma
animasyonları.

**Render** — kutu (6 stil + dash + marching ants + glow), crosshair/reticle/hız
vektörü, şablonlu etiketler (12 token, 6 konum), bağlantı çizgileri (Delaunay
dahil 6 mod × 5 stil), izler, konturlar (outline/hull/polygon), HUD ve grade
(scanline, grid, vignette, kromatik sapma, grain), 8 palet × 6 renk modu.

**Presetler** — 8 kategoride 29 yerleşik preset (gözetim, terminal/CRT, minimal,
Y2K, askeri/IR, veri, glitch, sinematik) + kendi presetlerin. Seçici penceresi her
preseti mevcut karenin canlı önizlemesiyle gösterir.

**Export** — MP4 (H.264) · WebM (VP9/VP8) · PNG sequence (ZIP) · GIF ·
JSON/CSV telemetri. Kare-doğru offline kodlama, sesi taşır, in/out aralığı,
2× supersample, yalnızca-overlay ve alfa kanalı seçenekleri.
