import type { HoopConfig, ReferencePlacement } from '@/types'

export function getHoopAspectRatio(hoop: HoopConfig): number {
  return hoop.widthMm / Math.max(1, hoop.heightMm)
}

export function fitImageInHoop(
  imageWidth: number,
  imageHeight: number
): ReferencePlacement {
  const safeWidth = Math.max(1, imageWidth)
  const safeHeight = Math.max(1, imageHeight)
  const imageAspect = safeWidth / safeHeight

  if (imageAspect >= 1) {
    return {
      x: 0,
      y: (1 - 1 / imageAspect) / 2,
      width: 1,
      height: 1 / imageAspect,
    }
  }

  return {
    x: (1 - imageAspect) / 2,
    y: 0,
    width: imageAspect,
    height: 1,
  }
}
