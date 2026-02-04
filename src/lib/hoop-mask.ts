import type { HoopConfig, HoopProcessingConfig, HoopProcessingShape, ReferencePlacement } from '@/types'

function toProcessingShape(shape: HoopConfig['shape']): HoopProcessingShape {
  if (shape === 'round') return 'circle'
  if (shape === 'oval') return 'oval'
  return 'square'
}

export function createHoopProcessingConfig(
  imageWidth: number,
  imageHeight: number,
  placement: ReferencePlacement,
  hoop: HoopConfig
): HoopProcessingConfig {
  const width = Math.max(1, placement.width * imageWidth)
  const height = Math.max(1, placement.height * imageHeight)
  const centerX = (placement.x + placement.width * 0.5) * imageWidth
  const centerY = (placement.y + placement.height * 0.5) * imageHeight

  return {
    shape: toProcessingShape(hoop.shape),
    centerX,
    centerY,
    width,
    height,
    rotation: 0,
  }
}

function isInsideHoop(x: number, y: number, hoop: HoopProcessingConfig): boolean {
  const halfW = Math.max(0.0001, hoop.width * 0.5)
  const halfH = Math.max(0.0001, hoop.height * 0.5)
  const dx = x - hoop.centerX
  const dy = y - hoop.centerY
  const radians = (hoop.rotation * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const rx = dx * cos + dy * sin
  const ry = -dx * sin + dy * cos
  const nx = rx / halfW
  const ny = ry / halfH

  if (hoop.shape === 'circle') {
    return nx * nx + ny * ny <= 1
  }

  if (hoop.shape === 'oval') {
    return nx * nx + ny * ny <= 1
  }

  return Math.abs(nx) <= 1 && Math.abs(ny) <= 1
}

export function createHoopMask(width: number, height: number, hoop: HoopProcessingConfig): Uint8Array {
  const mask = new Uint8Array(width * height)
  for (let y = 0; y < height; y += 1) {
    const yOff = y * width
    for (let x = 0; x < width; x += 1) {
      mask[yOff + x] = isInsideHoop(x + 0.5, y + 0.5, hoop) ? 1 : 0
    }
  }
  return mask
}

