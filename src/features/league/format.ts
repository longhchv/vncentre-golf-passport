// Định dạng dùng chung cho mục "Thành tích SNAG Golf League" (spec 13 mục 6).

/** Hạng kiểu BXH: đồng điểm → "T7", không đồng → "7" (spec 13 mục 6.4). */
export function rankLabel(rank: number | null | undefined, tied: boolean | null | undefined): string {
  if (rank == null) return '—'
  return tied ? `T${rank}` : String(rank)
}

/** Điểm so với par: 0 → "E", dương có dấu "+", âm giữ dấu "−". */
export function toParLabel(toPar: number | null | undefined): string {
  if (toPar == null) return '—'
  if (toPar === 0) return 'E'
  return toPar > 0 ? `+${toPar}` : `−${Math.abs(toPar)}`
}

/** 3200 → "3.200" (vi) / "3,200" (en). */
export function pointsLabel(points: number | null | undefined, lang: string): string {
  if (points == null) return '—'
  return new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'vi-VN').format(points)
}
