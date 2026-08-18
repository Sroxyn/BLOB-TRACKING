/**
 * Kare indeksi sıçrama toleransı.
 *
 * Worker meşgulken önizleme kare atlayabilir (en yenisi kazanır). Bu kadar
 * kareye kadar ileri sıçrama hâlâ "ardışık" sayılır; aksi hâlde her düşen kare
 * zamansal durumu (hareket birikimi, arka plan modeli) ve track ID'lerini
 * sıfırlar, oynatma sırasında ID'ler sürekli yenilenirdi.
 */
export const MAX_ADVANCE_GAP = 15
