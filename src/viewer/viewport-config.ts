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
    .drag({ mouseButtons: 'all', underflow: 'center' })
    .pinch()
    .wheel({ smooth: 3, wheelZoom: true })
    .decelerate({ friction: 0.9 })
    .clamp({ direction: 'all', underflow: 'center' })
    .clampZoom({
      minScale: VIEWER.MIN_ZOOM,
      maxScale: VIEWER.MAX_ZOOM,
    })

  return viewport
}

export function setViewportInteractionEnabled(viewport: Viewport, enabled: boolean): void {
  const pluginNames = ['drag', 'pinch', 'wheel', 'decelerate']
  for (const pluginName of pluginNames) {
    if (enabled) {
      viewport.plugins.resume(pluginName)
    } else {
      viewport.plugins.pause(pluginName)
    }
  }
}

export function fitViewportToWorld(
  viewport: Viewport,
  worldWidth: number,
  worldHeight: number
) {
  if (worldWidth <= 0 || worldHeight <= 0) return

  viewport.resize(viewport.screenWidth, viewport.screenHeight, worldWidth, worldHeight)
  viewport.fitWorld(true)
  viewport.moveCenter(worldWidth / 2, worldHeight / 2)
}
