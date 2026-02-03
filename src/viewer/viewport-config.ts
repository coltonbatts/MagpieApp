import { Viewport } from 'pixi-viewport'
import type { Application } from 'pixi.js'
import { VIEWER } from '@/lib/constants'

export function createViewport(
  app: Application,
  worldWidth: number,
  worldHeight: number,
  screenWidth: number,
  screenHeight: number
): Viewport {
  const viewport = new Viewport({
    screenWidth,
    screenHeight,
    worldWidth,
    worldHeight,
    events: app.renderer.events,
  })

  viewport
    .drag()
    .pinch()
    .wheel({ smooth: 3 })
    .decelerate({ friction: 0.9 })
    .clamp({ direction: 'all' })
    .clampZoom({
      minScale: VIEWER.MIN_ZOOM,
      maxScale: VIEWER.MAX_ZOOM,
    })

  return viewport
}
