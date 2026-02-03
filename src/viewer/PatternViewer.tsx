import { useEffect, useRef, useState } from 'react'
import type * as PIXINamespace from 'pixi.js'
import type { Viewport } from 'pixi-viewport'
import { Pattern } from '@/model/Pattern'
import { VIEWER } from '@/lib/constants'
import { createViewport, fitViewportToWorld } from './viewport-config'
import { usePatternStore } from '@/store/pattern-store'
import { useUIStore } from '@/store/ui-store'
import { linearRgbToOkLab, okLabDistanceSqWeighted } from '@/processing/color-spaces'
import { getProcessedPaths, type Point, type Path } from '@/processing/vectorize'

interface PatternViewerProps {
  pattern: Pattern | null
}

export function PatternViewer({ pattern }: PatternViewerProps) {
  const { workflowStage } = useUIStore()
  const [activeTab, setActiveTab] = useState<'finished' | 'pattern'>('finished')

  // Local toggles for Finished Preview
  const [showStitchedOnly, setShowStitchedOnly] = useState(false)

  // Local toggles for Pattern Preview
  const [showGrid, setShowGrid] = useState(true)
  const [showLabels, setShowLabels] = useState(true)
  const [showOutlines, setShowOutlines] = useState(true)

  // Sync stage to tab
  useEffect(() => {
    if (workflowStage === 'Export') {
      setActiveTab('pattern')
      setShowGrid(false)
    } else {
      setActiveTab('finished')
      setShowGrid(true)
    }
  }, [workflowStage])
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
  const { processingConfig } = usePatternStore()
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
          antialias: true,
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
    renderPattern(pixiRef.current, viewportRef.current, pattern, {
      activeTab,
      showStitchedOnly,
      showGrid,
      showLabels,
      showOutlines,
      config: processingConfig
    })
    fitViewportToWorld(viewportRef.current, worldWidth, worldHeight)
    hasUserTransformedViewportRef.current = false
  }, [isReady, pattern, activeTab, showStitchedOnly, showGrid, showLabels, showOutlines, processingConfig])

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
      <div className="absolute left-1/2 top-4 z-10 -translate-x-1/2 flex items-center gap-1 rounded-lg bg-white/95 p-1 shadow-lg ring-1 ring-black/10">
        <button
          onClick={() => setActiveTab('finished')}
          className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${activeTab === 'finished'
            ? 'bg-blue-500 text-white shadow-sm'
            : 'text-gray-600 hover:bg-gray-100'
            }`}
        >
          Finished
        </button>
        <button
          onClick={() => setActiveTab('pattern')}
          className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${activeTab === 'pattern'
            ? 'bg-blue-500 text-white shadow-sm'
            : 'text-gray-600 hover:bg-gray-100'
            }`}
        >
          Pattern
        </button>
      </div>

      <div className="absolute left-4 top-4 z-10 flex flex-col gap-2">
        {activeTab === 'finished' ? (
          <div className="flex items-center gap-2 rounded-lg bg-white/95 px-3 py-2 shadow-sm ring-1 ring-black/5">
            <input
              type="checkbox"
              id="showStitchedOnly"
              checked={showStitchedOnly}
              onChange={(e) => setShowStitchedOnly(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600"
            />
            <label htmlFor="showStitchedOnly" className="text-xs font-medium text-gray-700 select-none">
              Stitched Only
            </label>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 rounded-lg bg-white/95 p-2 shadow-sm ring-1 ring-black/5">
            <div className="flex items-center gap-2 px-1">
              <input
                type="checkbox"
                id="showGrid"
                checked={showGrid}
                onChange={(e) => setShowGrid(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600"
              />
              <label htmlFor="showGrid" className="text-xs font-medium text-gray-700 select-none">
                Grid
              </label>
            </div>
            <div className="flex items-center gap-2 px-1">
              <input
                type="checkbox"
                id="showLabels"
                checked={showLabels}
                onChange={(e) => setShowLabels(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600"
              />
              <label htmlFor="showLabels" className="text-xs font-medium text-gray-700 select-none">
                Labels
              </label>
            </div>
            <div className="flex items-center gap-2 px-1">
              <input
                type="checkbox"
                id="showOutlines"
                checked={showOutlines}
                onChange={(e) => setShowOutlines(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600"
              />
              <label htmlFor="showOutlines" className="text-xs font-medium text-gray-700 select-none">
                Outlines
              </label>
            </div>
          </div>
        )}
      </div>

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

interface RenderOptions {
  activeTab: 'finished' | 'pattern'
  showStitchedOnly: boolean
  showGrid: boolean
  showLabels: boolean
  showOutlines: boolean
  config: any
}

function renderPattern(
  PIXI: typeof PIXINamespace,
  viewport: Viewport,
  pattern: Pattern,
  options: RenderOptions
) {
  const { activeTab, showStitchedOnly, config } = options
  const cellSize = VIEWER.CELL_SIZE
  const fabricIndices = getFabricIndices(pattern, config)
  const fabricColor = (config.fabricColor.r << 16) | (config.fabricColor.g << 8) | config.fabricColor.b

  // 1. Draw Background (only if not stitched-only in finished mode)
  if (!(activeTab === 'finished' && showStitchedOnly)) {
    const bg = new PIXI.Graphics()
    bg.rect(0, 0, pattern.width * cellSize, pattern.height * cellSize)
    bg.fill(fabricColor)
    viewport.addChild(bg)
  }

  // 2. Main Rendering Path
  if (activeTab === 'finished') {
    renderFinishedPreview(PIXI, viewport, pattern, options, fabricIndices)
  } else {
    renderPatternPreview(PIXI, viewport, pattern, options, fabricIndices)
  }
}

function renderFinishedPreview(
  PIXI: typeof PIXINamespace,
  viewport: Viewport,
  pattern: Pattern,
  options: RenderOptions,
  fabricIndices: Set<number>
) {
  const { config } = options
  const cellSize = VIEWER.CELL_SIZE

  if (config.organicPreview && pattern.labels && pattern.paletteHex) {
    // Vector Organic Look
    const paths = getProcessedPaths(pattern.labels, pattern.width, pattern.height, fabricIndices, {
      simplify: 0.4,
      smooth: 3
    })
    paths.forEach(path => {
      if (path.isFabric) return
      const color = parseInt(pattern.paletteHex![path.label].slice(1), 16)

      const poly = new PIXI.Graphics()
      poly.poly(path.points.map((p: Point) => ({ x: p.x * cellSize, y: p.y * cellSize })))
      poly.fill(color)
      viewport.addChild(poly)
    })
  } else {
    // Stitch-like Pixel Look
    const stitchLayer = new PIXI.Graphics()
    const gap = 1.5
    const radius = 2

    pattern.stitches.forEach((stitch) => {
      const colorIdx = pattern.rawPalette.indexOf(stitch.hex.toUpperCase())
      if (fabricIndices.has(colorIdx)) return

      const color = parseInt(stitch.hex.slice(1), 16)
      // Draw a rounded rectangle for a "stitch" look
      stitchLayer.roundRect(
        stitch.x * cellSize + gap / 2,
        stitch.y * cellSize + gap / 2,
        cellSize - gap,
        cellSize - gap,
        radius
      )
      stitchLayer.fill(color)
    })
    viewport.addChild(stitchLayer)
  }
}

function renderPatternPreview(
  PIXI: typeof PIXINamespace,
  viewport: Viewport,
  pattern: Pattern,
  options: RenderOptions,
  fabricIndices: Set<number>
) {
  const { showGrid, showLabels, showOutlines } = options
  const cellSize = VIEWER.CELL_SIZE

  // 1. Grid (Drawn first so it's behind if needed)
  if (showGrid) {
    const grid = new PIXI.Graphics()
    grid.setStrokeStyle({ width: 1, color: 0x000000, alpha: 0.1 })

    for (let x = 0; x <= pattern.width; x++) {
      grid.moveTo(x * cellSize, 0)
      grid.lineTo(x * cellSize, pattern.height * cellSize)
    }
    for (let y = 0; y <= pattern.height; y++) {
      grid.moveTo(0, y * cellSize)
      grid.lineTo(pattern.width * cellSize, y * cellSize)
    }
    grid.stroke()
    viewport.addChild(grid)
  }

  // 2. Vector Paths and Labels
  if (pattern.labels && pattern.paletteHex) {
    const paths = getProcessedPaths(pattern.labels, pattern.width, pattern.height, fabricIndices, {
      simplify: 0.4,
      smooth: 3
    })

    paths.forEach((path: Path) => {
      if (path.isFabric) return

      // Outline
      if (showOutlines) {
        const outline = new PIXI.Graphics()
        outline.poly(path.points.map((p: Point) => ({ x: p.x * cellSize, y: p.y * cellSize })))
        outline.setStrokeStyle({ width: 1.5, color: 0x000000, alpha: 0.8 })
        outline.stroke()
        viewport.addChild(outline)
      }

      // Label
      if (showLabels && path.points.length > 5) {
        const center = getBoundingBoxCenter(path.points)
        const label = new PIXI.Text({
          text: (path.label + 1).toString(),
          style: {
            fontFamily: 'Arial',
            fontSize: Math.max(8, cellSize * 0.4),
            fill: 0x000000,
            align: 'center',
            fontWeight: 'bold'
          }
        })
        label.anchor.set(0.5)
        label.position.set(center.x * cellSize, center.y * cellSize)
        viewport.addChild(label)
      }
    })
  }
}

function getBoundingBoxCenter(points: Array<{ x: number, y: number }>): { x: number, y: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
}

function getFabricIndices(pattern: Pattern, config: any): Set<number> {
  const fabricIndices = new Set<number>()
  if (!pattern.paletteHex) return fabricIndices

  const fabricOkLab = linearRgbToOkLab(srgbToLinear(config.fabricColor.r), srgbToLinear(config.fabricColor.g), srgbToLinear(config.fabricColor.b))
  const thresholdSq = config.stitchThreshold * config.stitchThreshold

  pattern.rawPalette.forEach((hex, idx) => {
    const rgb = hexToRgb(hex)
    const lab = linearRgbToOkLab(srgbToLinear(rgb.r), srgbToLinear(rgb.g), srgbToLinear(rgb.b))
    const distSq = okLabDistanceSqWeighted(lab[0], lab[1], lab[2], fabricOkLab[0], fabricOkLab[1], fabricOkLab[2], 1.35)
    if (distSq < thresholdSq) fabricIndices.add(idx)
  })
  return fabricIndices
}

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return { r, g, b }
}

function srgbToLinear(v: number): number {
  const s = v / 255
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}
