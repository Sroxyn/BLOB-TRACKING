/**
 * Hungarian (Kuhn–Munkres) — en küçük maliyetli atama, O(n²m) kısa yol
 * (JV / potansiyel) kurgusuyla. Blob sayısı ≤ 32 olduğu için fazlasıyla hızlı.
 *
 * Girdi düz bir maliyet matrisidir: cost[i * cols + j].
 * Çıktı: her satır için atanan sütun (-1 = atanmadı).
 *
 * Uygulama e-maxx'in klasik potansiyel tabanlı kurgusudur; satır sayısı
 * sütun sayısından fazlaysa matris devriktirilip sonuç geri çevrilir.
 */
export function hungarian(cost: Float64Array, rows: number, cols: number): Int32Array {
  if (rows === 0 || cols === 0) return new Int32Array(rows).fill(-1)

  if (rows > cols) {
    const t = new Float64Array(cols * rows)
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) t[j * rows + i] = cost[i * cols + j]
    const colToRow = hungarian(t, cols, rows)
    const out = new Int32Array(rows).fill(-1)
    for (let j = 0; j < cols; j++) {
      const i = colToRow[j]
      if (i >= 0) out[i] = j
    }
    return out
  }

  const n = rows
  const m = cols
  const INF = Number.POSITIVE_INFINITY
  const u = new Float64Array(n + 1)
  const v = new Float64Array(m + 1)
  const p = new Int32Array(m + 1) // p[j] = j sütununa atanan satır (1-tabanlı)
  const way = new Int32Array(m + 1)

  for (let i = 1; i <= n; i++) {
    p[0] = i
    let j0 = 0
    const minv = new Float64Array(m + 1).fill(INF)
    const used = new Uint8Array(m + 1)
    do {
      used[j0] = 1
      const i0 = p[j0]
      let delta = INF
      let j1 = 0
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue
        const cur = cost[(i0 - 1) * m + (j - 1)] - u[i0] - v[j]
        if (cur < minv[j]) {
          minv[j] = cur
          way[j] = j0
        }
        if (minv[j] < delta) {
          delta = minv[j]
          j1 = j
        }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          u[p[j]] += delta
          v[j] -= delta
        } else {
          minv[j] -= delta
        }
      }
      j0 = j1
    } while (p[j0] !== 0)
    do {
      const j1 = way[j0]
      p[j0] = p[j1]
      j0 = j1
    } while (j0)
  }

  const out = new Int32Array(n).fill(-1)
  for (let j = 1; j <= m; j++) {
    const i = p[j]
    if (i > 0) out[i - 1] = j - 1
  }
  return out
}
