import { invoke } from '@tauri-apps/api/core'
import type { ColoringBookData, HoopProcessingConfig } from '@/types'

export const COLORING_BOOK_MIN_COLORS = 4
export const COLORING_BOOK_MAX_COLORS = 30

function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

async function imageDataToBytes(imageData: ImageData): Promise<Uint8Array> {
  const canvas = new OffscreenCanvas(imageData.width, imageData.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Failed to get canvas context')
  ctx.putImageData(imageData, 0, 0)
  const blob = await canvas.convertToBlob({ type: 'image/png' })
  return new Uint8Array(await blob.arrayBuffer())
}

export async function processColoringBookImage(
  image: ImageData,
  colorCount: number,
  hoopConfig: HoopProcessingConfig
): Promise<ColoringBookData> {
  if (!isTauriEnvironment()) {
    throw new Error('Coloring book processing requires Tauri desktop runtime.')
  }

  const clampedColorCount = Math.max(
    COLORING_BOOK_MIN_COLORS,
    Math.min(COLORING_BOOK_MAX_COLORS, Math.round(colorCount))
  )
  const normalizedDetail =
    (clampedColorCount - COLORING_BOOK_MIN_COLORS) /
    Math.max(1, COLORING_BOOK_MAX_COLORS - COLORING_BOOK_MIN_COLORS)

  const imageBytes = await imageDataToBytes(image)

  return invoke<ColoringBookData>('process_image', {
    imageData: imageBytes,
    colorCount: clampedColorCount,
    detailLevel: normalizedDetail,
    hoopConfig,
  })
}
