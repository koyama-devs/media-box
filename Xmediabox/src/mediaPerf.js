/**
 * Run async tasks with a fixed concurrency pool.
 */
export async function mapPool(items, concurrency, worker) {
  const list = Array.from(items)
  if (list.length === 0) return []
  const limit = Math.max(1, Math.min(concurrency, list.length))
  const results = new Array(list.length)
  let nextIndex = 0

  async function run() {
    while (nextIndex < list.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await worker(list[index], index)
    }
  }

  await Promise.all(Array.from({ length: limit }, () => run()))
  return results
}

/**
 * Downscale an image blob for gallery thumbnails.
 */
export async function blobToThumbnailUrl(blob, maxEdge = 560, quality = 0.72) {
  if (!blob || typeof createImageBitmap !== 'function') {
    return URL.createObjectURL(blob)
  }
  if (blob.type && !blob.type.startsWith('image/')) {
    return URL.createObjectURL(blob)
  }

  let bitmap
  try {
    bitmap = await createImageBitmap(blob)
  } catch {
    return URL.createObjectURL(blob)
  }

  const longest = Math.max(bitmap.width, bitmap.height)
  if (!longest || longest <= maxEdge) {
    bitmap.close()
    return URL.createObjectURL(blob)
  }

  const scale = maxEdge / longest
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) {
    bitmap.close()
    return URL.createObjectURL(blob)
  }
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const thumbBlob = await new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', quality)
  })
  return URL.createObjectURL(thumbBlob || blob)
}
