import { describe, expect, it } from 'vitest'
import { createDefaultCamera, fitCameraToWorld, screenToWorld, zoomAtCursor } from '@/lib/camera'

describe('camera math', () => {
  it('keeps cursor-anchored world point stable while zooming', () => {
    const camera = { ...createDefaultCamera(0.1, 10), zoom: 1.5, panX: 40, panY: 28, isFitted: false }
    const cursor = { x: 120, y: 90 }
    const before = screenToWorld(camera, cursor)
    const next = zoomAtCursor({
      camera,
      cursor,
      screen: { width: 300, height: 200 },
      factor: 1.2,
    })
    const after = screenToWorld(next, cursor)
    expect(after.x).toBeCloseTo(before.x, 6)
    expect(after.y).toBeCloseTo(before.y, 6)
  })

  it('fits world bounds into screen with centered pan', () => {
    const camera = createDefaultCamera(0.1, 10)
    const fitted = fitCameraToWorld(
      camera,
      { width: 1000, height: 700 },
      { width: 400, height: 200 },
      0
    )
    expect(fitted.zoom).toBeCloseTo(2.5, 5)
    expect(fitted.panX).toBeCloseTo(0, 5)
    expect(fitted.panY).toBeCloseTo(100, 5)
    expect(fitted.isFitted).toBe(true)
  })
})
