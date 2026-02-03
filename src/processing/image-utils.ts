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

  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(width, height)
      : Object.assign(document.createElement('canvas'), { width, height })

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Could not create 2D canvas context for normalization.')
  }

  // Keep normalization deterministic: nearest-neighbor resize, then raw RGBA extraction.
  context.imageSmoothingEnabled = false
  context.drawImage(bitmap, 0, 0, width, height)

  return context.getImageData(0, 0, width, height)
}
