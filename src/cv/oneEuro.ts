/**
 * One Euro Filter (Casiez et al., 2012).
 *
 * Kutuların titremesini keser ama hızlı hareketi geciktirmez: kesme frekansı
 * sinyalin türeviyle birlikte artar → yavaşken çok yumuşak, hızlıyken çevik.
 * EMA'nın "ya titrek ya gecikmeli" ikilemini çözen kısım budur.
 *
 * Durum düz bir nesnede tutulur; böylece track anlık görüntüsü (snapshot)
 * kolayca kopyalanabilir ve aynı kare yeniden işlendiğinde geri yüklenebilir.
 */

export interface EuroState {
  x: number
  dx: number
  init: boolean
}

export function newEuroState(): EuroState {
  return { x: 0, dx: 0, init: false }
}

export function copyEuroState(s: EuroState): EuroState {
  return { x: s.x, dx: s.dx, init: s.init }
}

function alpha(cutoff: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoff)
  return 1 / (1 + tau / dt)
}

/**
 * @param minCutoff Hz — düşük = daha yumuşak
 * @param beta      hız katsayısı — yüksek = hızlı harekette daha çevik
 * @param dt        saniye
 */
export function euroFilter(
  s: EuroState,
  value: number,
  dt: number,
  minCutoff: number,
  beta: number,
  dCutoff = 1,
): number {
  if (!s.init) {
    s.x = value
    s.dx = 0
    s.init = true
    return value
  }
  if (dt <= 0) return s.x
  const dxRaw = (value - s.x) / dt
  const aD = alpha(dCutoff, dt)
  s.dx = s.dx + aD * (dxRaw - s.dx)
  const cutoff = minCutoff + beta * Math.abs(s.dx)
  const a = alpha(cutoff, dt)
  s.x = s.x + a * (value - s.x)
  return s.x
}

/** UI'daki 0–0.95 "smooth amount" değerini kesme frekansına çevirir. */
export function smoothingToCutoff(smoothing: number): number {
  return 15 * Math.pow(0.022, Math.min(0.98, Math.max(0, smoothing)))
}
