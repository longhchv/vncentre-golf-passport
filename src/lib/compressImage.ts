/**
 * Nén ảnh trên máy trước khi tải lên (E5: ảnh thẻ điểm dưới 1 MB).
 * Thu cạnh dài về tối đa maxSide px, xuất JPEG, giảm chất lượng dần tới khi dưới maxBytes.
 */
export async function compressImage(file: File, maxBytes = 1_000_000, maxSide = 1600): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) throw new Error('photo_type')
  let side = maxSide
  for (let attempt = 0; attempt < 6; attempt++) {
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    for (const quality of [0.85, 0.75, 0.65, 0.55]) {
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', quality))
      if (blob && blob.size <= maxBytes) return blob
    }
    side = Math.round(side * 0.8)
  }
  throw new Error('photo_too_large')
}
