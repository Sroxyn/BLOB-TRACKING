/**
 * PARAM_SCHEMA — tüm efekt parametrelerinin TEK doğru kaynağı.
 *
 * Buraya bir satır eklemek şu üçünü aynı anda yapar:
 *   1. `Params` tipine tipli bir alan ekler (mapped type ile şemadan türetilir)
 *   2. Control Panel'de doğru kontrolü otomatik üretir (kind + group + showIf)
 *   3. Preset / URL paylaşımı / randomize / reset akışlarına dahil eder
 *
 * Elle slider yazılmaz.
 */

export type ParamKind = 'float' | 'int' | 'bool' | 'color' | 'enum' | 'text'

export type ParamValue = number | boolean | string

/** showIf içinde şemanın kendisine bakabilmek için gevşek tip (döngüsel bağımlılığı önler). */
export type LooseParams = Record<string, ParamValue>

export interface ParamBase {
  label: string
  group: GroupId
  hint?: string
  /** Panelde yalnızca "advanced" açıkken görünür. */
  advanced?: boolean
  /** Koşullu görünürlük. */
  showIf?: (p: LooseParams) => boolean
  /** Randomize bu parametreye dokunmasın. */
  noRandom?: boolean
}

export interface NumberDef extends ParamBase {
  kind: 'float' | 'int'
  default: number
  min: number
  max: number
  step: number
  unit?: string
}
export interface BoolDef extends ParamBase {
  kind: 'bool'
  default: boolean
}
export interface ColorDef extends ParamBase {
  kind: 'color'
  default: string
}
export interface EnumDef extends ParamBase {
  kind: 'enum'
  default: string
  options: readonly string[]
}
export interface TextDef extends ParamBase {
  kind: 'text'
  default: string
}

export type ParamDef = NumberDef | BoolDef | ColorDef | EnumDef | TextDef

export const GROUPS = [
  { id: 'source', label: 'SOURCE' },
  { id: 'detection', label: 'DETECTION' },
  { id: 'tracking', label: 'TRACKING' },
  { id: 'boxes', label: 'BOXES' },
  { id: 'markers', label: 'MARKERS' },
  { id: 'labels', label: 'LABELS' },
  { id: 'links', label: 'LINKS' },
  { id: 'trails', label: 'TRAILS' },
  { id: 'contour', label: 'CONTOUR' },
  { id: 'background', label: 'BACKGROUND' },
  { id: 'hud', label: 'HUD / GRADE' },
  { id: 'color', label: 'COLOR' },
] as const

export type GroupId = (typeof GROUPS)[number]['id']

const isMode = (mode: string) => (p: LooseParams) => p.sourceMode === mode

export const PARAM_SCHEMA = {
  /* ── SOURCE ─────────────────────────────────────────────────────────── */
  sourceMode: {
    kind: 'enum', label: 'Source Mode', group: 'source', noRandom: true,
    options: ['luminance', 'chroma', 'diff', 'background', 'edge'],
    default: 'luminance',
    hint: 'Blob maskesinin nasıl üretileceği',
  },
  threshold: {
    kind: 'int', label: 'Threshold', group: 'source', min: 0, max: 255, step: 1, default: 150,
    showIf: (p) => p.sourceMode === 'luminance' && p.adaptive !== true,
  },
  thresholdInvert: {
    kind: 'bool', label: 'Dark Blobs', group: 'source', default: false,
    hint: 'Eşiğin altındaki pikselleri blob say',
    showIf: isMode('luminance'),
  },
  adaptive: {
    kind: 'bool', label: 'Adaptive', group: 'source', default: false,
    hint: 'Blok ortalaması − C ile yerel eşik',
    showIf: isMode('luminance'),
  },
  adaptiveBlock: {
    kind: 'int', label: 'Adaptive Block', group: 'source', min: 3, max: 99, step: 2, default: 25,
    showIf: (p) => p.sourceMode === 'luminance' && p.adaptive === true,
  },
  adaptiveC: {
    kind: 'float', label: 'Adaptive Bias', group: 'source', min: -40, max: 40, step: 0.5, default: 6,
    showIf: (p) => p.sourceMode === 'luminance' && p.adaptive === true,
  },
  hysteresis: {
    kind: 'bool', label: 'Hysteresis', group: 'source', default: false, advanced: true,
    hint: 'Yüksek eşiğe bağlı zayıf pikselleri de dahil et',
  },
  hysteresisLow: {
    kind: 'float', label: 'Hysteresis Low', group: 'source', min: 0.1, max: 0.95, step: 0.01, default: 0.5,
    advanced: true, showIf: (p) => p.hysteresis === true,
  },
  keyColor: {
    kind: 'color', label: 'Key Color', group: 'source', default: '#00b140', showIf: isMode('chroma'),
  },
  keySpace: {
    kind: 'enum', label: 'Key Space', group: 'source', options: ['hsv', 'rgb'], default: 'hsv',
    showIf: isMode('chroma'),
  },
  keyTolerance: {
    kind: 'float', label: 'Key Tolerance', group: 'source', min: 0, max: 1, step: 0.005, default: 0.22,
    showIf: isMode('chroma'),
  },
  keySoftness: {
    kind: 'float', label: 'Key Softness', group: 'source', min: 0, max: 1, step: 0.005, default: 0.08,
    showIf: isMode('chroma'),
  },
  keyInvert: {
    kind: 'bool', label: 'Key Invert', group: 'source', default: true,
    hint: 'Açık: renge UZAK olanlar blob (yeşil perde arkası)', showIf: isMode('chroma'),
  },
  diffThreshold: {
    kind: 'int', label: 'Diff Threshold', group: 'source', min: 1, max: 128, step: 1, default: 22,
    showIf: isMode('diff'),
  },
  diffPersistence: {
    kind: 'float', label: 'Motion Decay', group: 'source', min: 0, max: 0.95, step: 0.01, default: 0.35,
    hint: 'Hareket izini birkaç kare tut (0 = anlık)', showIf: isMode('diff'),
  },
  bgLearningRate: {
    kind: 'float', label: 'Learning Rate', group: 'source', min: 0, max: 0.2, step: 0.001, default: 0.02,
    showIf: isMode('background'),
  },
  bgThreshold: {
    kind: 'int', label: 'BG Threshold', group: 'source', min: 1, max: 128, step: 1, default: 28,
    showIf: isMode('background'),
  },
  bgFreeze: {
    kind: 'bool', label: 'Freeze Background', group: 'source', default: false, noRandom: true,
    hint: 'Açıldığı andaki kareyi referans arka plan olarak sabitler',
    showIf: isMode('background'),
  },
  edgeThreshold: {
    kind: 'int', label: 'Edge Threshold', group: 'source', min: 1, max: 255, step: 1, default: 70,
    showIf: isMode('edge'),
  },

  /* ── DETECTION ──────────────────────────────────────────────────────── */
  detectionScale: {
    kind: 'float', label: 'Detection Scale', group: 'detection', min: 0.1, max: 1, step: 0.05, default: 0.35,
    hint: 'Tespit çözünürlüğü. Düşük = hızlı.', noRandom: true,
  },
  blurRadius: {
    kind: 'float', label: 'Blur', group: 'detection', min: 0, max: 20, step: 0.5, default: 2, unit: 'px',
  },
  brightness: {
    kind: 'float', label: 'Brightness', group: 'detection', min: -1, max: 1, step: 0.01, default: 0,
  },
  contrast: {
    kind: 'float', label: 'Contrast', group: 'detection', min: -1, max: 1, step: 0.01, default: 0,
  },
  gamma: {
    kind: 'float', label: 'Gamma', group: 'detection', min: 0.2, max: 3, step: 0.01, default: 1,
  },
  preInvert: {
    kind: 'bool', label: 'Invert Input', group: 'detection', default: false,
  },
  noiseReduction: {
    kind: 'int', label: 'Noise Reduction', group: 'detection', min: 0, max: 5, step: 1, default: 1,
    hint: 'Morphological open iterasyonu',
  },
  fillHoles: {
    kind: 'int', label: 'Fill Holes', group: 'detection', min: 0, max: 5, step: 1, default: 1,
    hint: 'Morphological close iterasyonu',
  },
  morphKernel: {
    kind: 'enum', label: 'Kernel', group: 'detection', options: ['3', '5', '7'], default: '3', advanced: true,
  },
  minArea: {
    kind: 'float', label: 'Min Area', group: 'detection', min: 0, max: 10, step: 0.005, default: 0.08, unit: '%',
    hint: 'Kare alanının yüzdesi',
  },
  maxArea: {
    kind: 'float', label: 'Max Area', group: 'detection', min: 0.5, max: 100, step: 0.5, default: 60, unit: '%',
  },
  minWidth: {
    kind: 'int', label: 'Min Width', group: 'detection', min: 0, max: 200, step: 1, default: 0, unit: 'px', advanced: true,
  },
  minHeight: {
    kind: 'int', label: 'Min Height', group: 'detection', min: 0, max: 200, step: 1, default: 0, unit: 'px', advanced: true,
  },
  aspectMin: {
    kind: 'float', label: 'Aspect Min', group: 'detection', min: 0.02, max: 5, step: 0.01, default: 0.05, advanced: true,
  },
  aspectMax: {
    kind: 'float', label: 'Aspect Max', group: 'detection', min: 0.2, max: 25, step: 0.1, default: 20, advanced: true,
  },
  maxBlobs: {
    kind: 'int', label: 'Max Blobs', group: 'detection', min: 1, max: 32, step: 1, default: 12,
  },
  edgeExclude: {
    kind: 'bool', label: 'Exclude Edge Blobs', group: 'detection', default: false,
  },
  mergeDistance: {
    kind: 'float', label: 'Merge Distance', group: 'detection', min: 0, max: 30, step: 0.5, default: 0, unit: '%',
    hint: 'Merkezleri yakın blobları birleştir (kare köşegeninin %)',
  },

  /* ── TRACKING ───────────────────────────────────────────────────────── */
  trackingEnabled: {
    kind: 'bool', label: 'Tracking', group: 'tracking', default: true, noRandom: true,
  },
  persistence: {
    kind: 'int', label: 'Persistence', group: 'tracking', min: 0, max: 60, step: 1, default: 14, unit: 'f',
    hint: 'Kaybolan track kaç kare hayatta kalsın (occlusion)',
  },
  minHits: {
    kind: 'int', label: 'Min Hits', group: 'tracking', min: 1, max: 10, step: 1, default: 3,
    hint: 'Bu kadar kare görülmeden çizilmez',
  },
  maxCost: {
    kind: 'float', label: 'Match Tolerance', group: 'tracking', min: 0.05, max: 2, step: 0.01, default: 0.7,
  },
  costDistance: {
    kind: 'float', label: 'Cost · Distance', group: 'tracking', min: 0, max: 3, step: 0.05, default: 1, advanced: true,
  },
  costIoU: {
    kind: 'float', label: 'Cost · IoU', group: 'tracking', min: 0, max: 3, step: 0.05, default: 0.6, advanced: true,
  },
  costArea: {
    kind: 'float', label: 'Cost · Area', group: 'tracking', min: 0, max: 3, step: 0.05, default: 0.3, advanced: true,
  },
  smoothMode: {
    kind: 'enum', label: 'Smoothing', group: 'tracking', options: ['oneEuro', 'ema', 'off'], default: 'oneEuro',
  },
  smoothing: {
    kind: 'float', label: 'Smooth Amount', group: 'tracking', min: 0, max: 0.95, step: 0.01, default: 0.55,
    showIf: (p) => p.smoothMode !== 'off',
  },
  oneEuroBeta: {
    kind: 'float', label: 'Speed Response', group: 'tracking', min: 0, max: 0.05, step: 0.001, default: 0.012,
    advanced: true, showIf: (p) => p.smoothMode === 'oneEuro',
  },
  idFormat: {
    kind: 'enum', label: 'ID Format', group: 'tracking',
    options: ['1', '01', '#001', 'TRK_001', '0x1A', 'hex4'], default: '01',
  },
  spawnDuration: {
    kind: 'int', label: 'Spawn Anim', group: 'tracking', min: 0, max: 30, step: 1, default: 6, unit: 'f',
  },
  fadeOut: {
    kind: 'int', label: 'Fade Out', group: 'tracking', min: 0, max: 30, step: 1, default: 8, unit: 'f',
  },

  /* ── BOXES ──────────────────────────────────────────────────────────── */
  boxStyle: {
    kind: 'enum', label: 'Box Style', group: 'boxes',
    options: ['corners', 'full', 'circle', 'ellipse', 'capsule', 'diamond', 'none'], default: 'corners',
  },
  cornerLength: {
    kind: 'float', label: 'Corner Length', group: 'boxes', min: 0.02, max: 0.5, step: 0.005, default: 0.22,
    showIf: (p) => p.boxStyle === 'corners',
  },
  boxStrokeWidth: {
    kind: 'float', label: 'Stroke Width', group: 'boxes', min: 0.5, max: 12, step: 0.25, default: 2, unit: 'px',
    showIf: (p) => p.boxStyle !== 'none',
  },
  boxOpacity: {
    kind: 'float', label: 'Stroke Opacity', group: 'boxes', min: 0, max: 1, step: 0.01, default: 1,
    showIf: (p) => p.boxStyle !== 'none',
  },
  boxFill: {
    kind: 'float', label: 'Fill Opacity', group: 'boxes', min: 0, max: 1, step: 0.01, default: 0,
    showIf: (p) => p.boxStyle !== 'none',
  },
  boxPadding: {
    kind: 'float', label: 'Padding', group: 'boxes', min: -20, max: 60, step: 1, default: 6, unit: 'px',
    showIf: (p) => p.boxStyle !== 'none',
  },
  boxRoundness: {
    kind: 'float', label: 'Roundness', group: 'boxes', min: 0, max: 40, step: 1, default: 0, unit: 'px',
    showIf: (p) => p.boxStyle === 'full',
  },
  boxSquare: {
    kind: 'bool', label: 'Force Square', group: 'boxes', default: false,
    showIf: (p) => p.boxStyle !== 'none',
  },
  boxDash: {
    kind: 'enum', label: 'Dash', group: 'boxes', options: ['solid', 'dashed', 'dotted', 'dash-dot'], default: 'solid',
    showIf: (p) => p.boxStyle !== 'none',
  },
  boxDashScale: {
    kind: 'float', label: 'Dash Scale', group: 'boxes', min: 0.2, max: 6, step: 0.1, default: 1,
    showIf: (p) => p.boxStyle !== 'none' && p.boxDash !== 'solid',
  },
  boxDashSpeed: {
    kind: 'float', label: 'Marching Ants', group: 'boxes', min: -40, max: 40, step: 0.5, default: 0, unit: 'px/f',
    showIf: (p) => p.boxStyle !== 'none' && p.boxDash !== 'solid',
  },
  boxGlow: {
    kind: 'float', label: 'Glow', group: 'boxes', min: 0, max: 40, step: 1, default: 0, unit: 'px',
    showIf: (p) => p.boxStyle !== 'none',
  },
  boxPulseAmount: {
    kind: 'float', label: 'Pulse Amount', group: 'boxes', min: 0, max: 0.4, step: 0.005, default: 0,
    showIf: (p) => p.boxStyle !== 'none',
  },
  boxPulseSpeed: {
    kind: 'float', label: 'Pulse Speed', group: 'boxes', min: 0.1, max: 8, step: 0.1, default: 2,
    showIf: (p) => p.boxStyle !== 'none' && (p.boxPulseAmount as number) > 0,
  },

  /* ── MARKERS ────────────────────────────────────────────────────────── */
  crosshair: {
    kind: 'bool', label: 'Crosshair', group: 'markers', default: true,
  },
  crosshairExtend: {
    kind: 'float', label: 'Crosshair Extend', group: 'markers', min: 0, max: 1, step: 0.01, default: 0.12,
    hint: '0 = küçük artı · 1 = kareyi baştan başa keser', showIf: (p) => p.crosshair === true,
  },
  crosshairWidth: {
    kind: 'float', label: 'Crosshair Width', group: 'markers', min: 0.25, max: 6, step: 0.25, default: 1,
    showIf: (p) => p.crosshair === true,
  },
  crosshairGap: {
    kind: 'float', label: 'Crosshair Gap', group: 'markers', min: 0, max: 40, step: 1, default: 0, unit: 'px',
    showIf: (p) => p.crosshair === true,
  },
  centroidDot: {
    kind: 'float', label: 'Centroid Dot', group: 'markers', min: 0, max: 20, step: 0.5, default: 2.5, unit: 'px',
  },
  centroidHollow: {
    kind: 'bool', label: 'Hollow Dot', group: 'markers', default: false,
    showIf: (p) => (p.centroidDot as number) > 0,
  },
  reticle: {
    kind: 'bool', label: 'Reticle', group: 'markers', default: false,
  },
  reticleRadius: {
    kind: 'float', label: 'Reticle Radius', group: 'markers', min: 4, max: 120, step: 1, default: 26, unit: 'px',
    showIf: (p) => p.reticle === true,
  },
  reticleSpeed: {
    kind: 'float', label: 'Reticle Spin', group: 'markers', min: -8, max: 8, step: 0.1, default: 1.2,
    showIf: (p) => p.reticle === true,
  },
  reticleTicks: {
    kind: 'int', label: 'Reticle Ticks', group: 'markers', min: 0, max: 24, step: 1, default: 8,
    showIf: (p) => p.reticle === true,
  },
  velocityVector: {
    kind: 'bool', label: 'Velocity Vector', group: 'markers', default: false,
  },
  velocityScale: {
    kind: 'float', label: 'Velocity Scale', group: 'markers', min: 0.5, max: 40, step: 0.5, default: 8,
    showIf: (p) => p.velocityVector === true,
  },

  /* ── LABELS ─────────────────────────────────────────────────────────── */
  labelEnabled: {
    kind: 'bool', label: 'Labels', group: 'labels', default: true,
  },
  labelTemplate: {
    kind: 'text', label: 'Template', group: 'labels', default: 'ID:{id}', noRandom: true,
    hint: '{id} {x} {y} {w} {h} {area} {vx} {vy} {speed} {age} {conf} {index}',
    showIf: (p) => p.labelEnabled === true,
  },
  labelPosition: {
    kind: 'enum', label: 'Position', group: 'labels',
    options: ['top-left', 'top-right', 'bottom', 'center', 'follow-corner', 'outside-leader'],
    default: 'top-left', showIf: (p) => p.labelEnabled === true,
  },
  labelFont: {
    kind: 'enum', label: 'Font', group: 'labels', options: ['mono', 'sans', 'condensed'], default: 'mono',
    showIf: (p) => p.labelEnabled === true,
  },
  labelSize: {
    kind: 'float', label: 'Size', group: 'labels', min: 6, max: 64, step: 0.5, default: 13, unit: 'px',
    showIf: (p) => p.labelEnabled === true,
  },
  labelTracking: {
    kind: 'float', label: 'Letter Spacing', group: 'labels', min: -2, max: 12, step: 0.1, default: 0.5, unit: 'px',
    showIf: (p) => p.labelEnabled === true,
  },
  labelUppercase: {
    kind: 'bool', label: 'Uppercase', group: 'labels', default: true, showIf: (p) => p.labelEnabled === true,
  },
  labelOpacity: {
    kind: 'float', label: 'Opacity', group: 'labels', min: 0, max: 1, step: 0.01, default: 1,
    showIf: (p) => p.labelEnabled === true,
  },
  labelBackground: {
    kind: 'float', label: 'Backdrop', group: 'labels', min: 0, max: 1, step: 0.01, default: 0,
    showIf: (p) => p.labelEnabled === true,
  },
  labelPadding: {
    kind: 'float', label: 'Backdrop Pad', group: 'labels', min: 0, max: 16, step: 0.5, default: 3, unit: 'px',
    showIf: (p) => p.labelEnabled === true && (p.labelBackground as number) > 0,
  },
  labelBorder: {
    kind: 'bool', label: 'Backdrop Border', group: 'labels', default: false,
    showIf: (p) => p.labelEnabled === true && (p.labelBackground as number) > 0,
  },
  labelDecimals: {
    kind: 'int', label: 'Decimals', group: 'labels', min: 0, max: 4, step: 1, default: 0,
    showIf: (p) => p.labelEnabled === true,
  },
  coordSpace: {
    kind: 'enum', label: 'Coord Space', group: 'labels', options: ['pixel', 'normalized', 'centered'],
    default: 'pixel', showIf: (p) => p.labelEnabled === true,
  },

  /* ── LINKS ──────────────────────────────────────────────────────────── */
  linkMode: {
    kind: 'enum', label: 'Link Mode', group: 'links',
    options: ['off', 'nearest-n', 'all', 'chain', 'delaunay', 'to-center', 'to-largest'], default: 'off',
  },
  linkNearestN: {
    kind: 'int', label: 'Nearest N', group: 'links', min: 1, max: 8, step: 1, default: 2,
    showIf: (p) => p.linkMode === 'nearest-n',
  },
  linkMaxDistance: {
    kind: 'float', label: 'Max Distance', group: 'links', min: 1, max: 150, step: 1, default: 45, unit: '%',
    hint: 'Kare köşegeninin yüzdesi', showIf: (p) => p.linkMode !== 'off',
  },
  linkStyle: {
    kind: 'enum', label: 'Style', group: 'links', options: ['straight', 'arc', 'bezier', 'orthogonal', 'spline'],
    default: 'straight', showIf: (p) => p.linkMode !== 'off',
  },
  linkWidth: {
    kind: 'float', label: 'Width', group: 'links', min: 0.25, max: 8, step: 0.25, default: 1,
    showIf: (p) => p.linkMode !== 'off',
  },
  linkOpacity: {
    kind: 'float', label: 'Opacity', group: 'links', min: 0, max: 1, step: 0.01, default: 0.5,
    showIf: (p) => p.linkMode !== 'off',
  },
  linkFadeByDistance: {
    kind: 'bool', label: 'Fade By Distance', group: 'links', default: true, showIf: (p) => p.linkMode !== 'off',
  },
  linkDash: {
    kind: 'enum', label: 'Dash', group: 'links', options: ['solid', 'dashed', 'dotted'], default: 'solid',
    showIf: (p) => p.linkMode !== 'off',
  },
  linkMidpointDot: {
    kind: 'float', label: 'Midpoint Dot', group: 'links', min: 0, max: 10, step: 0.5, default: 0, unit: 'px',
    showIf: (p) => p.linkMode !== 'off',
  },
  linkLabel: {
    kind: 'bool', label: 'Distance Label', group: 'links', default: false, showIf: (p) => p.linkMode !== 'off',
  },

  /* ── TRAILS ─────────────────────────────────────────────────────────── */
  trailLength: {
    kind: 'int', label: 'Trail Length', group: 'trails', min: 0, max: 120, step: 1, default: 0, unit: 'f',
  },
  trailStyle: {
    kind: 'enum', label: 'Style', group: 'trails', options: ['line', 'dots', 'ribbon', 'fade'], default: 'fade',
    showIf: (p) => (p.trailLength as number) > 0,
  },
  trailWidth: {
    kind: 'float', label: 'Width', group: 'trails', min: 0.25, max: 12, step: 0.25, default: 1.5,
    showIf: (p) => (p.trailLength as number) > 0,
  },
  trailTaper: {
    kind: 'float', label: 'Taper', group: 'trails', min: 0, max: 1, step: 0.01, default: 0.8,
    showIf: (p) => (p.trailLength as number) > 0,
  },
  trailOpacity: {
    kind: 'float', label: 'Opacity', group: 'trails', min: 0, max: 1, step: 0.01, default: 0.7,
    showIf: (p) => (p.trailLength as number) > 0,
  },
  trailColorMode: {
    kind: 'enum', label: 'Color', group: 'trails', options: ['track', 'single', 'gradient'], default: 'track',
    showIf: (p) => (p.trailLength as number) > 0,
  },

  /* ── CONTOUR ────────────────────────────────────────────────────────── */
  contourMode: {
    kind: 'enum', label: 'Contour', group: 'contour', options: ['off', 'outline', 'hull', 'polygon'], default: 'off',
  },
  contourWidth: {
    kind: 'float', label: 'Width', group: 'contour', min: 0.25, max: 8, step: 0.25, default: 1.5,
    showIf: (p) => p.contourMode !== 'off',
  },
  contourOpacity: {
    kind: 'float', label: 'Opacity', group: 'contour', min: 0, max: 1, step: 0.01, default: 0.9,
    showIf: (p) => p.contourMode !== 'off',
  },
  contourFill: {
    kind: 'float', label: 'Fill', group: 'contour', min: 0, max: 1, step: 0.01, default: 0,
    showIf: (p) => p.contourMode !== 'off',
  },
  simplifyEpsilon: {
    kind: 'float', label: 'Simplify', group: 'contour', min: 0.2, max: 20, step: 0.1, default: 2.5, unit: 'px',
    showIf: (p) => p.contourMode === 'polygon',
  },
  contourJitter: {
    kind: 'float', label: 'Jitter', group: 'contour', min: 0, max: 12, step: 0.25, default: 0, unit: 'px',
    showIf: (p) => p.contourMode !== 'off',
  },

  /* ── BACKGROUND ─────────────────────────────────────────────────────── */
  backgroundMode: {
    kind: 'enum', label: 'Background', group: 'background',
    options: ['original', 'dimmed', 'black', 'white', 'color', 'mask', 'maskColored', 'edges', 'posterize', 'pixelate'],
    default: 'original',
  },
  backgroundOpacity: {
    kind: 'float', label: 'Video Opacity', group: 'background', min: 0, max: 1, step: 0.01, default: 0.35,
    showIf: (p) => p.backgroundMode === 'dimmed',
  },
  backgroundColor: {
    kind: 'color', label: 'Color', group: 'background', default: '#0a0a0b',
    showIf: (p) => p.backgroundMode === 'color',
  },
  posterizeLevels: {
    kind: 'int', label: 'Levels', group: 'background', min: 2, max: 16, step: 1, default: 4,
    showIf: (p) => p.backgroundMode === 'posterize',
  },
  pixelateSize: {
    kind: 'int', label: 'Pixel Size', group: 'background', min: 2, max: 80, step: 1, default: 12,
    showIf: (p) => p.backgroundMode === 'pixelate',
  },
  backgroundBlur: {
    kind: 'float', label: 'Blur', group: 'background', min: 0, max: 40, step: 0.5, default: 0, unit: 'px',
  },
  backgroundSaturation: {
    kind: 'float', label: 'Saturation', group: 'background', min: 0, max: 2, step: 0.01, default: 1,
  },
  backgroundContrast: {
    kind: 'float', label: 'Contrast', group: 'background', min: 0, max: 2, step: 0.01, default: 1,
  },
  maskOverlay: {
    kind: 'bool', label: 'Mask Overlay', group: 'background', default: false,
  },
  maskColor: {
    kind: 'color', label: 'Mask Tint', group: 'background', default: '#00ff41',
    showIf: (p) => p.maskOverlay === true,
  },
  maskOpacity: {
    kind: 'float', label: 'Mask Opacity', group: 'background', min: 0, max: 1, step: 0.01, default: 0.35,
    showIf: (p) => p.maskOverlay === true,
  },
  maskBlend: {
    kind: 'enum', label: 'Mask Blend', group: 'background',
    options: ['screen', 'multiply', 'overlay', 'difference', 'lighten', 'source-over'], default: 'screen',
    showIf: (p) => p.maskOverlay === true,
  },

  /* ── HUD / GRADE ────────────────────────────────────────────────────── */
  hudCorners: {
    kind: 'bool', label: 'Frame Corners', group: 'hud', default: true,
  },
  hudTimecode: {
    kind: 'bool', label: 'Timecode', group: 'hud', default: true,
  },
  hudFrameNumber: {
    kind: 'bool', label: 'Frame Number', group: 'hud', default: false,
  },
  hudBlobCount: {
    kind: 'bool', label: 'Blob Count', group: 'hud', default: true,
  },
  hudRecDot: {
    kind: 'bool', label: 'REC Dot', group: 'hud', default: false,
  },
  hudText: {
    kind: 'text', label: 'Custom Text', group: 'hud', default: '', noRandom: true,
  },
  hudSize: {
    kind: 'float', label: 'HUD Size', group: 'hud', min: 6, max: 40, step: 0.5, default: 12, unit: 'px',
  },
  hudMargin: {
    kind: 'float', label: 'HUD Margin', group: 'hud', min: 0, max: 120, step: 1, default: 24, unit: 'px',
  },
  hudOpacity: {
    kind: 'float', label: 'HUD Opacity', group: 'hud', min: 0, max: 1, step: 0.01, default: 0.85,
  },
  scanlines: {
    kind: 'float', label: 'Scanlines', group: 'hud', min: 0, max: 1, step: 0.01, default: 0,
  },
  scanlineSpacing: {
    kind: 'int', label: 'Scanline Spacing', group: 'hud', min: 2, max: 24, step: 1, default: 4, unit: 'px',
    showIf: (p) => (p.scanlines as number) > 0,
  },
  gridAmount: {
    kind: 'float', label: 'Grid', group: 'hud', min: 0, max: 1, step: 0.01, default: 0,
  },
  gridSize: {
    kind: 'int', label: 'Grid Size', group: 'hud', min: 8, max: 400, step: 2, default: 80, unit: 'px',
    showIf: (p) => (p.gridAmount as number) > 0,
  },
  vignette: {
    kind: 'float', label: 'Vignette', group: 'hud', min: 0, max: 1, step: 0.01, default: 0,
  },
  chromaticAberration: {
    kind: 'float', label: 'Chromatic Ab.', group: 'hud', min: 0, max: 12, step: 0.25, default: 0, unit: 'px',
  },
  filmGrain: {
    kind: 'float', label: 'Grain', group: 'hud', min: 0, max: 1, step: 0.01, default: 0,
  },

  /* ── COLOR ──────────────────────────────────────────────────────────── */
  colorMode: {
    kind: 'enum', label: 'Color Mode', group: 'color',
    options: ['single', 'palette', 'by-area', 'by-velocity', 'by-position', 'rainbow'], default: 'single',
  },
  accentColor: {
    kind: 'color', label: 'Accent', group: 'color', default: '#00ff41',
    showIf: (p) => p.colorMode === 'single',
  },
  palette: {
    kind: 'enum', label: 'Palette', group: 'color',
    options: ['mono-white', 'terminal-green', 'amber-crt', 'cyan-magenta', 'hot-pink', 'military-olive', 'y2k', 'infrared'],
    default: 'terminal-green', showIf: (p) => p.colorMode !== 'single',
  },
  colorCycleSpeed: {
    kind: 'float', label: 'Cycle Speed', group: 'color', min: 0, max: 4, step: 0.05, default: 0.5,
    showIf: (p) => p.colorMode === 'rainbow',
  },
  blendMode: {
    kind: 'enum', label: 'Blend Mode', group: 'color',
    options: ['source-over', 'screen', 'lighten', 'difference', 'exclusion', 'overlay'], default: 'source-over',
  },
  globalOpacity: {
    kind: 'float', label: 'Overlay Opacity', group: 'color', min: 0, max: 1, step: 0.01, default: 1,
  },
} as const satisfies Record<string, ParamDef>

export type ParamKey = keyof typeof PARAM_SCHEMA

type ValueOfDef<D> =
  D extends { kind: 'enum'; options: readonly (infer O)[] } ? O :
  D extends { kind: 'bool' } ? boolean :
  D extends { kind: 'color' } ? string :
  D extends { kind: 'text' } ? string :
  D extends { kind: 'float' | 'int' } ? number :
  never

/** Uygulamanın her yerinde kullanılan tam tipli parametre nesnesi. */
export type Params = {
  -readonly [K in ParamKey]: ValueOfDef<(typeof PARAM_SCHEMA)[K]>
}

export const PARAM_KEYS = Object.keys(PARAM_SCHEMA) as ParamKey[]

export function getDef(key: ParamKey): ParamDef {
  return PARAM_SCHEMA[key] as ParamDef
}

export function defaultParams(): Params {
  const out: Record<string, ParamValue> = {}
  for (const k of PARAM_KEYS) out[k] = getDef(k).default
  return out as Params
}

export function isVisible(key: ParamKey, params: Params): boolean {
  const def = getDef(key)
  return def.showIf ? def.showIf(params as unknown as LooseParams) : true
}

/** Şemaya uymayan / eksik alanları temizler (preset, URL ve localStorage okuması için). */
export function sanitize(input: unknown): Params {
  const base = defaultParams() as unknown as Record<string, ParamValue>
  if (!input || typeof input !== 'object') return base as unknown as Params
  const raw = input as Record<string, unknown>
  for (const key of PARAM_KEYS) {
    const def = getDef(key)
    const v = raw[key]
    if (v === undefined || v === null) continue
    switch (def.kind) {
      case 'float':
      case 'int': {
        if (typeof v !== 'number' || !Number.isFinite(v)) break
        const n = def.kind === 'int' ? Math.round(v) : v
        base[key] = Math.min(def.max, Math.max(def.min, n))
        break
      }
      case 'bool':
        if (typeof v === 'boolean') base[key] = v
        break
      case 'color':
        if (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)) base[key] = v
        break
      case 'enum':
        if (typeof v === 'string' && def.options.includes(v)) base[key] = v
        break
      case 'text':
        if (typeof v === 'string') base[key] = v.slice(0, 240)
        break
    }
  }
  return base as unknown as Params
}
