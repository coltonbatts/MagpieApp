import { useEffect, useRef, useState } from 'react'
import type * as PIXINamespace from 'pixi.js'
import type { Viewport } from 'pixi-viewport'
import { Pattern } from '@/model/Pattern'
import { VIEWER } from '@/lib/constants'
import { createViewport, fitViewportToWorld } from './viewport-config'

interface PatternViewerProps {
  pattern: Pattern | null
  showGrid?: boolean
}

export function PatternViewer({ pattern, showGrid = true }: PatternViewerProps) {
  // 60-second QA checklist:
  // 1) Load a pattern and verify first paint is centered/fitted (not top-left).
  // 2) Drag + wheel zoom, then resize window: screen should resize but camera pose must persist.
  // 3) Click Fit: camera recenters/refits immediately, then resize should keep fitting until next user transform.
  // 4) In DEV, validate overlay values update (scale/center/world/screen) during pan/zoom/resize.
  // 5) Confirm stitch colors match legend swatches and do not shift with zoom/DPR.
  const containerRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<PIXINamespace.Application | null>(null)
  const viewportRef = useRef<Viewport | null>(null)
  const pixiRef = useRef<typeof PIXINamespace | null>(null)
  const worldSizeRef = useRef({ width: 1, height: 1 })
  const hasUserTransformedViewportRef = useRef(false)
  const [viewerError, setViewerError] = useState<string | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [debugText, setDebugText] = useState('')
  const isDev = import.meta.env.DEV

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let canceled = false
    let resizeObserver: ResizeObserver | null = null
    let stopDebugTicker: (() => void) | null = null

    const updateDebugText = () => {
      if (!isDev) return
      const viewport = viewportRef.current
      if (!viewport) return

      const center = viewport.center
      setDebugText(
        [
          `scale: ${viewport.scale.x.toFixed(4)} x ${viewport.scale.y.toFixed(4)}`,
          `center: ${center.x.toFixed(2)}, ${center.y.toFixed(2)}`,
          `world: ${viewport.worldWidth} x ${viewport.worldHeight}`,
          `bounds: l=${viewport.left.toFixed(2)} t=${viewport.top.toFixed(2)} r=${viewport.right.toFixed(2)} b=${viewport.bottom.toFixed(2)}`,
          `screen: ${viewport.screenWidth} x ${viewport.screenHeight}`,
        ].join('\n')
      )
    }

    const handleResize = () => {
      const app = appRef.current
      const viewport = viewportRef.current
      const host = containerRef.current
      if (!app || !viewport || !host) return

      const width = host.clientWidth || window.innerWidth
      const height = host.clientHeight || window.innerHeight
      app.renderer.resize(width, height)

      const { width: worldWidth, height: worldHeight } = worldSizeRef.current
      viewport.resize(width, height, worldWidth, worldHeight)

      if (!hasUserTransformedViewportRef.current) {
        fitViewportToWorld(viewport, worldWidth, worldHeight)
      }

      updateDebugText()
    }

    import('pixi.js')
      .then(async (PIXI) => {
        if (canceled) return

        const app = new PIXI.Application()
        await app.init({
          width: container.clientWidth || window.innerWidth,
          height: container.clientHeight || window.innerHeight,
          backgroundColor: 0xf5f5f5,
          antialias: false,
          autoDensity: true,
          // DPR controls canvas density only; stitch colors are direct solid fills.
          resolution: window.devicePixelRatio || 1,
        })

        if (canceled || !containerRef.current) return

        // Viewer lifecycle:
        // 1) Create App + Viewport once.
        // 2) Render pattern into viewport when data changes.
        // 3) Re-fit on first pattern render and on container resize.
        const viewport = createViewport(
          app,
          worldSizeRef.current.width,
          worldSizeRef.current.height,
          container.clientWidth || window.innerWidth,
          container.clientHeight || window.innerHeight
        )
        const markUserTransformed = (event?: { type?: string }) => {
          const type = event?.type
          if (type === 'drag' || type === 'wheel' || type === 'pinch') {
            hasUserTransformedViewportRef.current = true
          }
          updateDebugText()
        }

        viewport.on('moved', markUserTransformed)
        viewport.on('zoomed', markUserTransformed)
        app.stage.addChild(viewport)

        pixiRef.current = PIXI
        viewportRef.current = viewport
        containerRef.current.appendChild(app.canvas)
        appRef.current = app
        setIsReady(true)
        updateDebugText()

        if (isDev) {
          const interval = window.setInterval(updateDebugText, 150)
          stopDebugTicker = () => window.clearInterval(interval)
        }

        resizeObserver = new ResizeObserver(handleResize)
        resizeObserver.observe(containerRef.current)
      })
      .catch((error) => {
        console.error('Failed to initialize Pixi viewer:', error)
        setViewerError('Failed to initialize viewer. Check console for details.')
      })

    return () => {
      canceled = true
      resizeObserver?.disconnect()
      stopDebugTicker?.()
      appRef.current?.destroy(true, { children: true, texture: true })
      appRef.current = null
      viewportRef.current = null
      pixiRef.current = null
      worldSizeRef.current = { width: 1, height: 1 }
      hasUserTransformedViewportRef.current = false
      setIsReady(false)
      setDebugText('')
    }
  }, [isDev])

  const handleFitToView = () => {
    if (!viewportRef.current || !pattern) return
    fitViewportToWorld(
      viewportRef.current,
      worldSizeRef.current.width,
      worldSizeRef.current.height
    )
    hasUserTransformedViewportRef.current = false
    if (isDev) {
      const center = viewportRef.current.center
      setDebugText(
        [
          `scale: ${viewportRef.current.scale.x.toFixed(4)} x ${viewportRef.current.scale.y.toFixed(4)}`,
          `center: ${center.x.toFixed(2)}, ${center.y.toFixed(2)}`,
          `world: ${viewportRef.current.worldWidth} x ${viewportRef.current.worldHeight}`,
          `bounds: l=${viewportRef.current.left.toFixed(2)} t=${viewportRef.current.top.toFixed(2)} r=${viewportRef.current.right.toFixed(2)} b=${viewportRef.current.bottom.toFixed(2)}`,
          `screen: ${viewportRef.current.screenWidth} x ${viewportRef.current.screenHeight}`,
        ].join('\n')
      )
    }
  }

  useEffect(() => {
    if (!isReady) return
    if (!appRef.current || !containerRef.current || !pixiRef.current || !viewportRef.current) {
      return
    }

    if (!pattern) {
      viewportRef.current.removeChildren()
      worldSizeRef.current = { width: 1, height: 1 }
      viewportRef.current.resize(
        appRef.current.renderer.width,
        appRef.current.renderer.height,
        worldSizeRef.current.width,
        worldSizeRef.current.height
      )
      hasUserTransformedViewportRef.current = false
      return
    }

    const worldWidth = pattern.width * VIEWER.CELL_SIZE
    const worldHeight = pattern.height * VIEWER.CELL_SIZE
    worldSizeRef.current = { width: worldWidth, height: worldHeight }

    viewportRef.current.removeChildren()
    renderPattern(pixiRef.current, viewportRef.current, pattern, showGrid)
    fitViewportToWorld(viewportRef.current, worldWidth, worldHeight)
    hasUserTransformedViewportRef.current = false
  }, [isReady, pattern, showGrid])

  if (viewerError) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gray-100 text-sm text-red-600">
        {viewerError}
      </div>
    )
  }

  return (
    <div className="relative h-full w-full">
      <div
        ref={containerRef}
        className="h-full w-full"
        style={{ touchAction: 'none' }}
      />
      <div className="absolute right-4 top-4 z-10">
        <button
          type="button"
          onClick={handleFitToView}
          disabled={!pattern}
          className="rounded bg-white/95 px-3 py-1.5 text-sm text-gray-800 shadow ring-1 ring-black/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Fit
        </button>
      </div>
      {isDev && debugText && (
        <pre className="pointer-events-none absolute bottom-4 left-4 z-10 whitespace-pre rounded bg-black/80 px-3 py-2 font-mono text-[11px] leading-4 text-green-200">
          {debugText}
        </pre>
      )}
      {!pattern && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-gray-600">
          Upload an image to generate a pattern
        </div>
      )}
    </div>
  )
}

function renderPattern(
  PIXI: typeof PIXINamespace,
  viewport: Viewport,
  pattern: Pattern,
  showGrid: boolean
) {
  const cellSize = VIEWER.CELL_SIZE

  if (showGrid) {
    const grid = new PIXI.Graphics()
    grid.setStrokeStyle({ width: 1, color: 0xcccccc, alpha: 0.3 })

    for (let x = 0; x <= pattern.width; x++) {
      grid.moveTo(x * cellSize, 0)
      grid.lineTo(x * cellSize, pattern.height * cellSize)
      grid.stroke()
    }

    for (let y = 0; y <= pattern.height; y++) {
      grid.moveTo(0, y * cellSize)
      grid.lineTo(pattern.width * cellSize, y * cellSize)
      grid.stroke()
    }

    viewport.addChild(grid)
  }

  const stitchLayer = new PIXI.Graphics()
  // Colors are rendered directly from precomputed hex values with no Pixi filters
  // or texture sampling in this path (Graphics primitives only).
  pattern.stitches.forEach((stitch) => {
    const color = parseInt(stitch.hex.slice(1), 16)
    stitchLayer.rect(stitch.x * cellSize, stitch.y * cellSize, cellSize, cellSize)
    stitchLayer.fill(color)
  })

  viewport.addChild(stitchLayer)
}
