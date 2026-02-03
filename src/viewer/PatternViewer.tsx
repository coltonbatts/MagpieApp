import { useEffect, useRef, useState } from 'react'
import type * as PIXINamespace from 'pixi.js'
import type { Viewport } from 'pixi-viewport'
import { Pattern } from '@/model/Pattern'
import { VIEWER } from '@/lib/constants'

interface PatternViewerProps {
  pattern: Pattern | null
  showGrid?: boolean
}

export function PatternViewer({ pattern, showGrid = true }: PatternViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<PIXINamespace.Application | null>(null)
  const viewportRef = useRef<Viewport | null>(null)
  const pixiRef = useRef<typeof PIXINamespace | null>(null)
  const [viewerError, setViewerError] = useState<string | null>(null)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let canceled = false
    Promise.all([import('pixi.js')])
      .then(async ([PIXI]) => {
        if (canceled) return

        const app = new PIXI.Application()
        await app.init({
          width: container.clientWidth || window.innerWidth,
          height: container.clientHeight || window.innerHeight,
          backgroundColor: 0xf5f5f5,
          antialias: true,
          resolution: window.devicePixelRatio || 1,
        })

        if (canceled || !containerRef.current) return

        pixiRef.current = PIXI
        containerRef.current.appendChild(app.canvas)
        appRef.current = app
        setIsReady(true)
      })
      .catch((error) => {
        console.error('Failed to initialize Pixi viewer:', error)
        setViewerError('Failed to initialize viewer. Check console for details.')
      })

    return () => {
      canceled = true
      appRef.current?.destroy(true, { children: true, texture: true })
      appRef.current = null
      viewportRef.current = null
      pixiRef.current = null
      setIsReady(false)
    }
  }, [])

  useEffect(() => {
    if (!isReady) return
    if (!pattern || !appRef.current || !containerRef.current || !pixiRef.current) return

    import('./viewport-config')
      .then(({ createViewport }) => {
        if (!appRef.current || !containerRef.current || !pixiRef.current) return

        if (!viewportRef.current) {
          const viewport = createViewport(
            appRef.current,
            pattern.width * VIEWER.CELL_SIZE,
            pattern.height * VIEWER.CELL_SIZE,
            containerRef.current.clientWidth || window.innerWidth,
            containerRef.current.clientHeight || window.innerHeight
          )
          appRef.current.stage.addChild(viewport)
          viewportRef.current = viewport
        }

        viewportRef.current.removeChildren()
        renderPattern(pixiRef.current, viewportRef.current, pattern, showGrid)
      })
      .catch((error) => {
        console.error('Failed to initialize viewport:', error)
        setViewerError('Failed to initialize viewport. Check console for details.')
      })
  }, [isReady, pattern, showGrid])

  if (viewerError) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gray-100 text-sm text-red-600">
        {viewerError}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ touchAction: 'none' }}
    />
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

  const stitchLayer = new PIXI.Container()

  pattern.stitches.forEach((stitch) => {
    const cell = new PIXI.Graphics()
    const color = parseInt(stitch.hex.slice(1), 16)

    cell.rect(stitch.x * cellSize, stitch.y * cellSize, cellSize, cellSize)
    cell.fill(color)

    stitchLayer.addChild(cell)
  })

  viewport.addChild(stitchLayer)
}
