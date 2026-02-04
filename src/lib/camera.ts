import type { CameraState } from '@/types'

interface Size {
  width: number
  height: number
}

interface Point {
  x: number
  y: number
}

interface ZoomAtCursorOptions {
  camera: CameraState
  screen: Size
  cursor: Point
  factor: number
}

export function createDefaultCamera(minZoom: number, maxZoom: number): CameraState {
  return {
    zoom: 1,
    panX: 0,
    panY: 0,
    minZoom,
    maxZoom,
    isFitted: true,
  }
}

export function clampZoom(camera: CameraState, zoom: number): number {
  return Math.max(camera.minZoom, Math.min(camera.maxZoom, zoom))
}

export function screenToWorld(camera: CameraState, point: Point): Point {
  return {
    x: (point.x - camera.panX) / camera.zoom,
    y: (point.y - camera.panY) / camera.zoom,
  }
}

export function zoomAtCursor({ camera, screen, cursor, factor }: ZoomAtCursorOptions): CameraState {
  if (screen.width <= 0 || screen.height <= 0) return camera

  const nextZoom = clampZoom(camera, camera.zoom * factor)
  const world = screenToWorld(camera, cursor)
  return {
    ...camera,
    zoom: nextZoom,
    panX: cursor.x - world.x * nextZoom,
    panY: cursor.y - world.y * nextZoom,
    isFitted: false,
  }
}

export function fitCameraToWorld(
  camera: CameraState,
  screen: Size,
  world: Size,
  padding = 16
): CameraState {
  if (screen.width <= 0 || screen.height <= 0 || world.width <= 0 || world.height <= 0) {
    return camera
  }

  const usableWidth = Math.max(1, screen.width - padding * 2)
  const usableHeight = Math.max(1, screen.height - padding * 2)
  const fitZoom = clampZoom(camera, Math.min(usableWidth / world.width, usableHeight / world.height))

  return {
    ...camera,
    zoom: fitZoom,
    panX: (screen.width - world.width * fitZoom) / 2,
    panY: (screen.height - world.height * fitZoom) / 2,
    isFitted: true,
  }
}
