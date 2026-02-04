import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type * as PIXINamespace from 'pixi.js'
import type { Viewport } from 'pixi-viewport'
import { Pattern } from '@/model/Pattern'
import { ManualStitchEdit, SelectionArtifact, ProcessingConfig } from '@/types'
import { VIEWER } from '@/lib/constants'
import { createViewport, fitViewportToWorld } from './viewport-config'
import { usePatternStore } from '@/store/pattern-store'
import { useUIStore } from '@/store/ui-store'
import { linearRgbToOkLab, okLabDistanceSqWeighted } from '@/processing/color-spaces'
import { getProcessedPaths, type Point } from '@/processing/vectorize'
import { Button, Select, SegmentedControl, Toggle } from '@/components/ui'
import { incrementDevCounter } from '@/lib/dev-instrumentation'
import { PatternRegion } from '@/types'

const REGION_RESULT_CACHE = new Map<string, PatternRegion[]>()
const REGION_RESULT_CACHE_LIMIT = 16

function cacheRegions(signature: string, regions: PatternRegion[]) {
  if (!REGION_RESULT_CACHE.has(signature) && REGION_RESULT_CACHE.size >= REGION_RESULT_CACHE_LIMIT) {
    const firstKey = REGION_RESULT_CACHE.keys().next().value
    if (firstKey) {
      REGION_RESULT_CACHE.delete(firstKey)
    }
  }
  REGION_RESULT_CACHE.set(signature, regions)
}

function fnv1aHashString(seed: number, value: string): number {
  let hash = seed >>> 0
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

function buildPatternRegionSignature(pattern: Pattern): string {
  let hash = 0x811c9dc5
  hash = fnv1aHashString(hash, `${pattern.width}x${pattern.height}`)
  hash = fnv1aHashString(hash, `sel:${pattern.selection?.id ?? 'none'}`)
  for (const stitch of pattern.stitches) {
    hash = fnv1aHashString(hash, `${stitch.x},${stitch.y},${stitch.dmcCode},${stitch.hex}`)
  }
  return hash.toString(16)
}

function toRegionPayload(pattern: Pattern) {
  return {
    width: pattern.width,
    height: pattern.height,
    stitches: pattern.stitches.map((s) => ({
      x: s.x,
      y: s.y,
      dmc_code: s.dmcCode,
      hex: s.hex,
    })),
    legend: pattern.getLegend().map((l) => ({
      dmc_code: l.dmcCode,
      hex: l.hex,
    })),
  }
}

function usePatternRegions(pattern: Pattern | null) {
  const [regions, setRegions] = useState<PatternRegion[]>([])
  const [isComputing, setIsComputing] = useState(false)
  const inFlightSignature = useRef<string | null>(null)
  const patternSignature = useMemo(
    () => (pattern ? buildPatternRegionSignature(pattern) : null),
    [pattern]
  )

  useEffect(() => {
    if (!pattern || !patternSignature) {
      setRegions([])
      setIsComputing(false)
      return
    }

    const cached = REGION_RESULT_CACHE.get(patternSignature)
    if (cached) {
      setRegions(cached)
      setIsComputing(false)
      return
    }
    if (inFlightSignature.current === patternSignature) return

    let canceled = false
    inFlightSignature.current = patternSignature
    setIsComputing(true)

    const payload = toRegionPayload(pattern)

    invoke<PatternRegion[]>('compute_pattern_regions', { payload })
      .then((res) => {
        if (!canceled) {
          cacheRegions(patternSignature, res)
          setRegions(res)
          setIsComputing(false)
          inFlightSignature.current = null
        }
      })
      .catch((err) => {
        console.error('Failed to compute regions:', err)
        if (!canceled) setIsComputing(false)
        inFlightSignature.current = null
      })

    return () => {
      canceled = true
      inFlightSignature.current = null
    }
  }, [pattern, patternSignature])

  return { regions, isComputing }
}

interface PatternViewerProps {
  pattern: Pattern | null
}

const VIEWER_TABS: Array<{ value: 'finished' | 'pattern'; label: string }> = [
  { value: 'finished', label: 'Finished' },
  { value: 'pattern', label: 'Pattern' },
]

export function PatternViewer({ pattern }: PatternViewerProps) {
  const { workflowStage } = useUIStore()
  const [activeTab, setActiveTab] = useState<'finished' | 'pattern'>('finished')

  // Local toggles for Finished Preview
  const [showStitchedOnly, setShowStitchedOnly] = useState(false)

  // Local toggles for Pattern Preview
  const { viewMode, setViewMode, highlightColorKey, setHighlightColorKey } = useUIStore()
  const [showGrid, setShowGrid] = useState(false)
  const [showLabels, setShowLabels] = useState(true)
  const [showOutlines, setShowOutlines] = useState(true)
  const [hoveredRegionId, setHoveredRegionId] = useState<number | null>(null)

  // Sync stage to tab
  useEffect(() => {
    if (workflowStage === 'Export') {
      setActiveTab('pattern')
      setShowGrid(false)
      setViewMode('Grid')
    } else if (workflowStage === 'Build') {
      setActiveTab('pattern')
      setViewMode('Regions')
      setShowGrid(false)
    } else {
      setActiveTab('finished')
      setShowGrid(true)
    }
  }, [workflowStage, setViewMode])
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
  const processingConfig = usePatternStore((state) => state.processingConfig)
  const applyManualEdits = usePatternStore((state) => state.applyManualEdits)
  const clearManualEdits = usePatternStore((state) => state.clearManualEdits)
  const editTool = usePatternStore((state) => state.manualEditTool)
  const setEditTool = usePatternStore((state) => state.setManualEditTool)
  const worldSizeRef = useRef({ width: 1, height: 1 })
  const hasUserTransformedViewportRef = useRef(false)
  const pendingEditFrameRef = useRef<number | null>(null)
  const pendingStrokeEditsRef = useRef<Map<string, ManualStitchEdit>>(new Map())
  const isEditingStrokeRef = useRef(false)
  const lastEditedCellRef = useRef<string | null>(null)
  const [viewerError, setViewerError] = useState<string | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [debugText, setDebugText] = useState('')
  const [editModeEnabled, setEditModeEnabled] = useState(false)
  const [selectedPaintValue, setSelectedPaintValue] = useState<string>('')
  const isDev = import.meta.env.DEV
  const fabricIndices = useMemo(
    () => (pattern ? getFabricIndices(pattern, processingConfig) : new Set<number>()),
    [pattern, processingConfig]
  )
  const { regions } = usePatternRegions(pattern)

  useEffect(() => {
    if (!regions.length) {
      setHoveredRegionId(null)
      return
    }
    if (hoveredRegionId === null) return
    if (!regions.some((region) => region.id === hoveredRegionId)) {
      setHoveredRegionId(null)
    }
  }, [regions, hoveredRegionId])

  const paths = useMemo(() => {
    if (!pattern || !pattern.labels || !pattern.paletteHex) return []
    return getProcessedPaths(pattern.labels, pattern.width, pattern.height, fabricIndices, {
      simplify: 0.4,
      smooth: 3,
      manualMask: pattern.selection?.mask
    })
  }, [pattern, fabricIndices, processingConfig.organicPreview])

  const paintOptions = useMemo(() => {
    if (!pattern) return []

    const byId = new Map<string, { id: string; label: string; edit: Omit<ManualStitchEdit, 'x' | 'y'> }>()
    for (const stitch of pattern.stitches) {
      if (stitch.dmcCode === 'Fabric') continue
      const key = `${stitch.dmcCode}|${stitch.hex}|${stitch.marker}`
      if (byId.has(key)) continue
      byId.set(key, {
        id: key,
        label: stitch.dmcCode.startsWith('RAW-') ? stitch.hex : `DMC ${stitch.dmcCode}`,
        edit: {
          mode: 'paint',
          hex: stitch.hex,
          dmcCode: stitch.dmcCode,
          marker: stitch.marker,
        },
      })
    }

    return Array.from(byId.values())
  }, [pattern])

  useEffect(() => {
    if (!paintOptions.length) {
      setSelectedPaintValue('')
      return
    }
    if (paintOptions.some((option) => option.id === selectedPaintValue)) return
    setSelectedPaintValue(paintOptions[0].id)
  }, [paintOptions, selectedPaintValue])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let canceled = false
    let resizeObserver: ResizeObserver | null = null
    const updateDebugText = () => {
      if (!isDev) return
      const viewport = viewportRef.current
      if (!viewport) return

      const center = viewport.center
      const selectionMask = pattern?.selection?.mask
      const selectionSelected = selectionMask ? countSelected(selectionMask) : -1
      const selectionTotal = selectionMask ? selectionMask.length : -1
      const stitchedCount = pattern ? pattern.stitches.reduce((acc, stitch) => acc + (stitch.dmcCode !== 'Fabric' ? 1 : 0), 0) : -1
      const totalStitches = pattern ? pattern.stitches.length : -1
      setDebugText(
        [
          `selPx: ${selectionSelected >= 0 ? selectionSelected : 'none'} / ${selectionTotal >= 0 ? selectionTotal : 'none'}`,
          `stitches: ${stitchedCount >= 0 ? stitchedCount : 'none'} / ${totalStitches >= 0 ? totalStitches : 'none'}`,
          `scale: ${viewport.scale.x.toFixed(4)} x ${viewport.scale.y.toFixed(4)}`,
          `center: ${center.x.toFixed(2)}, ${center.y.toFixed(2)}`,
          `world: ${viewport.worldWidth} x ${viewport.worldHeight}`,
          `refId: ${pattern?.referenceId || 'none'}`,
          `selId: ${pattern?.selection?.id || 'none'}`,
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
        ].join('\n')
      )
    }
  }

  const flushPendingManualEdits = useCallback(() => {
    const pendingEntries = Array.from(pendingStrokeEditsRef.current.values())
    pendingStrokeEditsRef.current.clear()
    if (pendingEntries.length > 0) {
      applyManualEdits(pendingEntries)
    }
  }, [applyManualEdits])

  const schedulePendingEditFlush = useCallback(() => {
    if (pendingEditFrameRef.current !== null) return
    pendingEditFrameRef.current = window.requestAnimationFrame(() => {
      pendingEditFrameRef.current = null
      flushPendingManualEdits()
    })
  }, [flushPendingManualEdits])

  const buildEditFromPointer = useCallback((event: React.PointerEvent<HTMLDivElement>): ManualStitchEdit | null => {
    if (!pattern || !viewportRef.current) return null
    const selectedPaint = paintOptions.find((option) => option.id === selectedPaintValue)
    if (editTool === 'paint' && !selectedPaint) return null

    const bounds = event.currentTarget.getBoundingClientRect()
    const screenX = event.clientX - bounds.left
    const screenY = event.clientY - bounds.top
    const world = viewportRef.current.toWorld(screenX, screenY)
    const x = Math.floor(world.x / VIEWER.CELL_SIZE)
    const y = Math.floor(world.y / VIEWER.CELL_SIZE)

    if (x < 0 || y < 0 || x >= pattern.width || y >= pattern.height) {
      return null
    }

    if (editTool === 'fabric') {
      return { x, y, mode: 'fabric' }
    }

    return {
      x,
      y,
      ...selectedPaint!.edit,
    }
  }, [editTool, paintOptions, pattern, selectedPaintValue])

  const queueEditFromPointer = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const edit = buildEditFromPointer(event)
    if (!edit) return

    const key = `${edit.x}:${edit.y}`
    if (lastEditedCellRef.current === key) return
    lastEditedCellRef.current = key
    pendingStrokeEditsRef.current.set(key, edit)
    schedulePendingEditFlush()
  }, [buildEditFromPointer, schedulePendingEditFlush])

  const handleEditPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    isEditingStrokeRef.current = true
    queueEditFromPointer(event)
    event.currentTarget.setPointerCapture(event.pointerId)
  }, [queueEditFromPointer])

  const handleEditPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!isEditingStrokeRef.current) return
    queueEditFromPointer(event)
  }, [queueEditFromPointer])

  const endEditStroke = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!isEditingStrokeRef.current) return
    isEditingStrokeRef.current = false
    lastEditedCellRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (pendingEditFrameRef.current !== null) {
      window.cancelAnimationFrame(pendingEditFrameRef.current)
      pendingEditFrameRef.current = null
    }
    flushPendingManualEdits()
  }, [flushPendingManualEdits])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setHighlightColorKey(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setHighlightColorKey])

  useEffect(() => () => {
    if (pendingEditFrameRef.current !== null) {
      window.cancelAnimationFrame(pendingEditFrameRef.current)
      pendingEditFrameRef.current = null
    }
    pendingStrokeEditsRef.current.clear()
  }, [])

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
    const worldSizeChanged =
      worldSizeRef.current.width !== worldWidth || worldSizeRef.current.height !== worldHeight
    worldSizeRef.current = { width: worldWidth, height: worldHeight }

    viewportRef.current.removeChildren()
    renderPattern(pixiRef.current, viewportRef.current, pattern, {
      activeTab,
      showStitchedOnly,
      showGrid,
      showLabels,
      showOutlines,
      config: processingConfig,
      selection: pattern.selection,
      paths, // Pass memoized paths
      regions,
      viewMode,
      highlightColorKey,
      hoveredRegionId,
      onRegionHover: setHoveredRegionId,
      onClearHighlight: () => setHighlightColorKey(null),
    })
    if (isEditingStrokeRef.current) {
      incrementDevCounter('pixiRedrawsDuringDrag')
    }
    if (worldSizeChanged || !hasUserTransformedViewportRef.current) {
      fitViewportToWorld(viewportRef.current, worldWidth, worldHeight)
      hasUserTransformedViewportRef.current = false
    }
  }, [
    isReady,
    pattern,
    activeTab,
    showStitchedOnly,
    showGrid,
    showLabels,
    showOutlines,
    processingConfig,
    paths,
    regions,
    viewMode,
    highlightColorKey,
    hoveredRegionId,
    setHighlightColorKey,
  ])

  if (viewerError) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-surface-2 text-sm text-red-600">
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
      <div className="absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-lg border border-border bg-overlay/95 p-1 shadow-sm backdrop-blur">
        <SegmentedControl
          value={activeTab}
          onValueChange={setActiveTab}
          options={VIEWER_TABS}
          ariaLabel="Viewer mode"
        />
      </div>

      <div className="absolute left-4 top-4 z-10 flex flex-col gap-2">
        {activeTab === 'finished' ? (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-overlay/95 px-3 py-2 shadow-sm backdrop-blur">
            <span className="select-none text-xs font-medium text-fg-muted">Stitched Only</span>
            <Toggle checked={showStitchedOnly} onCheckedChange={setShowStitchedOnly} />
          </div>
        ) : (
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-overlay/95 p-2 shadow-sm backdrop-blur">
            <div className="flex items-center justify-between gap-4 rounded-md px-1 py-0.5">
              <span className="select-none text-xs font-medium text-fg-muted">Grid</span>
              <Toggle checked={showGrid} onCheckedChange={setShowGrid} />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-md px-1 py-0.5">
              <span className="select-none text-xs font-medium text-fg-muted">Labels</span>
              <Toggle checked={showLabels} onCheckedChange={setShowLabels} />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-md px-1 py-0.5">
              <span className="select-none text-xs font-medium text-fg-muted">Outlines</span>
              <Toggle checked={showOutlines} onCheckedChange={setShowOutlines} />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-md px-1 py-0.5">
              <span className="select-none text-xs font-medium text-fg-muted">Edit Mode</span>
              <Toggle checked={editModeEnabled} onCheckedChange={setEditModeEnabled} />
            </div>
          </div>
        )}
      </div>

      <div className="absolute right-4 top-4 z-10">
        <div className="rounded-lg border border-border bg-overlay/95 p-1 shadow-sm backdrop-blur">
          <Button
            type="button"
            onClick={handleFitToView}
            disabled={!pattern}
            size="sm"
            variant="secondary"
            className="min-w-14"
          >
            Fit
          </Button>
        </div>
      </div>

      {activeTab === 'pattern' && editModeEnabled && (
        <div className="absolute bottom-4 left-4 z-20 flex w-80 flex-col gap-2 rounded-lg border border-border bg-overlay/95 p-3 shadow-sm backdrop-blur">
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              size="sm"
              variant={editTool === 'paint' ? 'primary' : 'secondary'}
              onClick={() => setEditTool('paint')}
            >
              Paint
            </Button>
            <Button
              type="button"
              size="sm"
              variant={editTool === 'fabric' ? 'primary' : 'secondary'}
              onClick={() => setEditTool('fabric')}
            >
              Fabric
            </Button>
          </div>

          {editTool === 'paint' && (
            <label className="block text-xs text-fg-muted">
              <span className="mb-1 block">Paint Color</span>
              <Select
                value={selectedPaintValue}
                onChange={(event) => setSelectedPaintValue(event.target.value)}
                disabled={paintOptions.length === 0}
              >
                {paintOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </label>
          )}

          <p className="text-[11px] text-fg-subtle">
            Click or drag over stitches to apply manual overrides.
          </p>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              if (window.confirm('Clear all manual stitch edits for this project?')) {
                clearManualEdits()
              }
            }}
          >
            Clear Manual Edits
          </Button>
        </div>
      )}

      {activeTab === 'pattern' && editModeEnabled && pattern && (
        <div
          className="absolute inset-0 z-[5] cursor-crosshair touch-none"
          onPointerDown={handleEditPointerDown}
          onPointerMove={handleEditPointerMove}
          onPointerUp={endEditStroke}
          onPointerCancel={endEditStroke}
          onPointerLeave={endEditStroke}
        />
      )}
      {isDev && debugText && (
        <pre className="pointer-events-none absolute top-14 left-4 z-10 whitespace-pre rounded-md border border-border bg-overlay/95 px-3 py-2 font-mono text-[11px] leading-4 text-fg-muted shadow-sm">
          {debugText}
        </pre>
      )}
      {!pattern && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-fg-muted">
          Upload an image to generate a pattern
        </div>
      )}
    </div>
  )
}

function countSelected(mask: Uint8Array): number {
  let selected = 0
  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i] > 0) selected += 1
  }
  return selected
}

interface RenderOptions {
  activeTab: 'finished' | 'pattern'
  showStitchedOnly: boolean
  showGrid: boolean
  showLabels: boolean
  showOutlines: boolean
  config: ProcessingConfig
  selection: SelectionArtifact | null
  paths: any[]
  regions?: PatternRegion[]
  viewMode?: 'Regions' | 'Grid'
  highlightColorKey?: string | null
  hoveredRegionId?: number | null
  onRegionHover?: (regionId: number | null) => void
  onClearHighlight?: () => void
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
    if (activeTab === 'pattern') {
      bg.eventMode = 'static'
      bg.on('pointertap', () => {
        options.onClearHighlight?.()
        options.onRegionHover?.(null)
      })
    }
    viewport.addChild(bg)
  }

  // 2. Main Rendering Path
  if (activeTab === 'finished') {
    renderFinishedPreview(PIXI, viewport, pattern, options, fabricIndices)
  } else if (options.viewMode === 'Regions') {
    renderRegionView(PIXI, viewport, pattern, options)
  } else {
    renderPatternPreview(PIXI, viewport, pattern, options)
  }
}

function renderRegionView(
  PIXI: typeof PIXINamespace,
  viewport: Viewport,
  pattern: Pattern,
  options: RenderOptions
) {
  const {
    regions,
    highlightColorKey,
    showOutlines,
    showLabels,
    hoveredRegionId,
    onRegionHover,
  } = options
  if (!regions || regions.length === 0) {
    // Fallback to pattern preview if no regions yet
    renderPatternPreview(PIXI, viewport, pattern, options)
    return
  }

  const cellSize = VIEWER.CELL_SIZE
  const isHighlighting = !!highlightColorKey

  regions.forEach((region) => {
    const isTarget = isHighlighting && region.colorKey === highlightColorKey
    const isHovered = hoveredRegionId === region.id
    const color = parseInt(region.hex.slice(1), 16)
    const loopPoints = region.loops.map((loop) => loop.map((p) => ({ x: p.x * cellSize, y: p.y * cellSize })))
    const dimAlpha = isHighlighting && !isTarget ? 0.12 : 1

    if (isTarget || isHovered) {
      const fill = new PIXI.Graphics()
      for (const loop of loopPoints) {
        fill.poly(loop)
      }
      fill.fill({ color, alpha: isTarget ? 0.16 : 0.08 })
      fill.alpha = dimAlpha
      viewport.addChild(fill)
    }

    if (showOutlines || isTarget || isHovered) {
      const outline = new PIXI.Graphics()
      for (const loop of loopPoints) {
        outline.poly(loop)
      }
      outline.setStrokeStyle({
        width: isTarget ? 2.25 : isHovered ? 1.8 : 0.85,
        color: isTarget ? 0x111827 : 0x9ca3af,
        alpha: isTarget ? 0.9 : isHovered ? 0.7 : 0.5,
      })
      outline.stroke()
      outline.alpha = dimAlpha
      outline.eventMode = 'static'
      outline.cursor = 'pointer'
      outline.on('pointerover', () => onRegionHover?.(region.id))
      outline.on('pointerout', () => onRegionHover?.(null))
      outline.on('pointertap', (event: any) => {
        event.stopPropagation?.()
      })
      viewport.addChild(outline)
    }

    if (showLabels && (region.area > 4 || isTarget)) {
      const labelAlpha = isHighlighting ? (isTarget ? 1 : 0.08) : 0.75
      const label = new PIXI.Text({
        text: (region.colorIndex + 1).toString(),
        style: {
          fontFamily: 'Menlo, Monaco, monospace',
          fontSize: Math.max(7, cellSize * 0.45),
          fill: 0x000000,
          align: 'center',
          fontWeight: isTarget || isHovered ? 'bold' : 'normal',
        },
      })
      label.alpha = labelAlpha
      label.anchor.set(0.5)
      label.position.set(region.centroidX * cellSize, region.centroidY * cellSize)
      viewport.addChild(label)
    }
  })
}

function renderFinishedPreview(
  PIXI: typeof PIXINamespace,
  viewport: Viewport,
  pattern: Pattern,
  options: RenderOptions,
  fabricIndices: Set<number>
) {
  const { config, paths } = options
  const cellSize = VIEWER.CELL_SIZE

  if (config.organicPreview && pattern.labels && pattern.paletteHex) {
    // Vector Organic Look
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
    const mask = pattern.selection?.mask

    pattern.stitches.forEach((stitch, i) => {
      if (stitch.dmcCode === 'Fabric') return

      // Skip if explicitly masked out by user
      if (mask && mask[i] === 0) return

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
  options: RenderOptions
) {
  const { showGrid, showLabels, showOutlines, paths } = options
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
  if (!pattern.labels || !pattern.paletteHex) {
    const swatches = new PIXI.Graphics()
    pattern.stitches.forEach((stitch) => {
      const x = stitch.x * cellSize
      const y = stitch.y * cellSize
      const color = stitch.dmcCode === 'Fabric' ? 0xffffff : parseInt(stitch.hex.slice(1), 16)
      swatches.rect(x, y, cellSize, cellSize)
      swatches.fill(color)
    })
    viewport.addChild(swatches)

    if (showLabels) {
      pattern.stitches.forEach((stitch) => {
        if (stitch.dmcCode === 'Fabric' || !stitch.marker) return
        const label = new PIXI.Text({
          text: stitch.marker,
          style: {
            fontFamily: 'Arial',
            fontSize: Math.max(7, cellSize * 0.45),
            fill: 0x000000,
            align: 'center',
            fontWeight: 'bold'
          }
        })
        label.anchor.set(0.5)
        label.position.set(
          stitch.x * cellSize + cellSize * 0.5,
          stitch.y * cellSize + cellSize * 0.52
        )
        viewport.addChild(label)
      })
    }
    return
  }

  if (pattern.labels && pattern.paletteHex) {
    paths.forEach((path: any) => {
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

function getFabricIndices(pattern: Pattern, config: ProcessingConfig): Set<number> {
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
