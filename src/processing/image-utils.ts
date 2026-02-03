interface NormalizedDimensions {
  width: number
  height: number
}

export function getNormalizedDimensions(
  width: number,
  height: number,
  targetShortestSide: number
): NormalizedDimensions {
  const safeTarget = Math.max(1, Math.floor(targetShortestSide))
  const shortest = Math.min(width, height)
  const scale = safeTarget / shortest

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

export async function loadImageBitmap(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file)
}

export function normalizeImage(
  bitmap: ImageBitmap,
  targetShortestSide: number
): ImageData {
  const { width, height } = getNormalizedDimensions(
    bitmap.width,
    bitmap.height,
    targetShortestSide
  )

  return normalizeBitmapToImageData(bitmap, width, height)
}

export function normalizeImageCapped(
  bitmap: ImageBitmap,
  targetShortestSide: number,
  maxMegapixels: number
): ImageData {
  const base = getNormalizedDimensions(bitmap.width, bitmap.height, targetShortestSide)
  const maxPixels = Math.max(1, Math.floor(maxMegapixels * 1_000_000))
  const currentPixels = base.width * base.height

  if (currentPixels <= maxPixels) {
    return normalizeBitmapToImageData(bitmap, base.width, base.height)
  }

  // Cap selection buffers by total pixels so large uploads don't allocate extreme masks.
  const downscale = Math.sqrt(maxPixels / currentPixels)
  const width = Math.max(1, Math.floor(base.width * downscale))
  const height = Math.max(1, Math.floor(base.height * downscale))

  return normalizeBitmapToImageData(bitmap, width, height)
}

function normalizeBitmapToImageData(
  bitmap: ImageBitmap,
  width: number,
  height: number
): ImageData {

  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(width, height)
      : Object.assign(document.createElement('canvas'), { width, height })

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Could not create 2D canvas context for normalization.')
  }

  // Use high-quality resampling for the working grid to avoid harsh aliasing during stage previews.
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(bitmap, 0, 0, width, height)

  return context.getImageData(0, 0, width, height)
}
