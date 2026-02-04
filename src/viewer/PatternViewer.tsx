import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type * as PIXINamespace from 'pixi.js'
import { Pattern } from '@/model/Pattern'
import { BuildArtifact, ManualStitchEdit, SelectionArtifact, ProcessingConfig, CameraState } from '@/types'
import { VIEWER } from '@/lib/constants'
import { fitCameraToWorld, screenToWorld, zoomAtCursor } from '@/lib/camera'
import { usePatternStore } from '@/store/pattern-store'
import { useUIStore } from '@/store/ui-store'
import { linearRgbToOkLab, okLabDistanceSqWeighted } from '@/processing/color-spaces'
import { getProcessedPaths, type Point } from '@/processing/vectorize'
import { Button, Select, SegmentedControl, Toggle } from '@/components/ui'
import { incrementDevCounter } from '@/lib/dev-instrumentation'

export interface PatternViewerProps {
  pattern: Pattern | null
  activeTab?: 'finished' | 'pattern'
  onActiveTabChange?: (tab: 'finished' | 'pattern') => void
  showStitchedOnly?: boolean
  onShowStitchedOnlyChange?: (show: boolean) => void
  showGrid?: boolean
  onShowGridChange?: (show: boolean) => void
  showLabels?: boolean
  onShowLabelsChange?: (show: boolean) => void
  showOutlines?: boolean
  onShowOutlinesChange?: (show: boolean) => void
  editModeEnabled?: boolean
  onEditModeEnabledChange?: (enabled: boolean) => void
  editTool?: 'paint' | 'fabric'
  onEditToolChange?: (tool: 'paint' | 'fabric') => void
  selectedPaintValue?: string
  onSelectedPaintValueChange?: (value: string) => void
}

export function PatternViewer({
  pattern,
  activeTab: controlledActiveTab,
  onActiveTabChange,
  showStitchedOnly: controlledShowStitchedOnly,
  onShowStitchedOnlyChange,
  showGrid: controlledShowGrid,
  onShowGridChange,
  showLabels: controlledShowLabels,
  onShowLabelsChange,
  showOutlines: controlledShowOutlines,
  onShowOutlinesChange,
  editModeEnabled: controlledEditModeEnabled,
  onEditModeEnabledChange,
  editTool: controlledEditTool,
  onEditToolChange,
  selectedPaintValue: controlledSelectedPaintValue,
  onSelectedPaintValueChange,
}: PatternViewerProps) {
  const { workflowStage } = useUIStore()
  const viewerCamera = useUIStore((state) => state.viewerCamera)
  const setViewerCamera = useUIStore((state) => state.setViewerCamera)
  const buildArtifact = usePatternStore((state) => state.buildArtifact)
  const hoverRegionId = usePatternStore((state) => state.hoverRegionId)
  const activeRegionId = usePatternStore((state) => state.activeRegionId)
  const doneRegionIds = usePatternStore((state) => state.doneRegionIds)
  const setHoverRegionId = usePatternStore((state) => state.setHoverRegionId)
  const setActiveRegionId = usePatternStore((state) => state.setActiveRegionId)
  const toggleRegionDone = usePatternStore((state) => state.toggleRegionDone)
  const cameraInteractionEnabled = workflowStage === 'Build' || workflowStage === 'Export' || workflowStage === 'Select'

  // Local fallbacks if not controlled
  const [internalActiveTab, setInternalActiveTab] = useState<'finished' | 'pattern'>('finished')
  const activeTab = controlledActiveTab ?? internalActiveTab
  const setActiveTab = (tab: 'finished' | 'pattern') => {
    onActiveTabChange?.(tab)
    setInternalActiveTab(tab)
  }

  const [internalShowStitchedOnly, setInternalShowStitchedOnly] = useState(false)
  const showStitchedOnly = controlledShowStitchedOnly ?? internalShowStitchedOnly
  const setShowStitchedOnly = (show: boolean) => {
    onShowStitchedOnlyChange?.(show)
    setInternalShowStitchedOnly(show)
  }

  const { viewMode, setViewMode, highlightColorKey, setHighlightColorKey } = useUIStore()

  const [internalShowGrid, setInternalShowGrid] = useState(false)
  const showGrid = controlledShowGrid ?? internalShowGrid
  const setShowGrid = (show: boolean) => {
    onShowGridChange?.(show)
    setInternalShowGrid(show)
  }

  const [internalShowLabels, setInternalShowLabels] = useState(true)
  const showLabels = controlledShowLabels ?? internalShowLabels
  const setShowLabels = (show: boolean) => {
    onShowLabelsChange?.(show)
    setInternalShowLabels(show)
  }

  const [internalShowOutlines, setInternalShowOutlines] = useState(true)
  const showOutlines = controlledShowOutlines ?? internalShowOutlines
  const setShowOutlines = (show: boolean) => {
    onShowOutlinesChange?.(show)
    setInternalShowOutlines(show)
  }

  // Sync stage to tab
  useEffect(() => {
    if (workflowStage === 'Build') {
      setActiveTab('pattern')
      setViewMode('Regions')
      setShowGrid(false)
    } else if (workflowStage !== 'Export') {
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
  const worldContainerRef = useRef<PIXINamespace.Container | null>(null)
  const pixiRef = useRef<typeof PIXINamespace | null>(null)
  const processingConfig = usePatternStore((state) => state.processingConfig)
  const applyManualEdits = usePatternStore((state) => state.applyManualEdits)
  const clearManualEdits = usePatternStore((state) => state.clearManualEdits)
  const worldSizeRef = useRef({ width: 1, height: 1 })
  const cameraRef = useRef<CameraState>(viewerCamera)
  const [cameraDebugText, setCameraDebugText] = useState('')
  const [pointerDebugText, setPointerDebugText] = useState('')
  const pendingCameraCommitFrameRef = useRef<number | null>(null)
  const isPanningRef = useRef(false)
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const panPointerIdRef = useRef<number | null>(null)
  const spacePressedRef = useRef(false)
  const pendingEditFrameRef = useRef<number | null>(null)
  const pendingStrokeEditsRef = useRef<Map<string, ManualStitchEdit>>(new Map())
  const isEditingStrokeRef = useRef(false)
  const lastEditedCellRef = useRef<string | null>(null)
  const [viewerError, setViewerError] = useState<string | null>(null)
  const [isReady, setIsReady] = useState(false)

  const [internalEditModeEnabled, setInternalEditModeEnabled] = useState(false)
  const editModeEnabled = controlledEditModeEnabled ?? internalEditModeEnabled
  const setEditModeEnabled = (enabled: boolean) => {
    onEditModeEnabledChange?.(enabled)
    setInternalEditModeEnabled(enabled)
  }

  const [internalEditTool, setInternalEditTool] = useState<'paint' | 'fabric'>('paint')
  const editTool = controlledEditTool ?? internalEditTool
  const setEditTool = (tool: 'paint' | 'fabric') => {
    onEditToolChange?.(tool)
    setInternalEditTool(tool)
  }

  const [internalSelectedPaintValue, setInternalSelectedPaintValue] = useState<string>('')
  const selectedPaintValue = controlledSelectedPaintValue ?? internalSelectedPaintValue
  const setSelectedPaintValue = (value: string) => {
    onSelectedPaintValueChange?.(value)
    setInternalSelectedPaintValue(value)
  }

  const isDev = import.meta.env.DEV
  const cameraDebugEnabled = isDev && window.localStorage.getItem('magpie:cameraDebug') === '1'
  const fabricIndices = useMemo(
    () => (pattern ? getFabricIndices(pattern, processingConfig) : new Set<number>()),
    [pattern, processingConfig]
  )

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
    if (!buildArtifact) {
      if (hoverRegionId !== null) setHoverRegionId(null)
      if (activeRegionId !== null) setActiveRegionId(null)
      return
    }
    if (hoverRegionId !== null && hoverRegionId > buildArtifact.regions.length) {
      setHoverRegionId(null)
    }
    if (activeRegionId !== null && activeRegionId > buildArtifact.regions.length) {
      setActiveRegionId(null)
    }
  }, [activeRegionId, buildArtifact, hoverRegionId, setActiveRegionId, setHoverRegionId])

  const updateDebugText = useCallback((pointer?: { screenX: number; screenY: number }) => {
    if (!cameraDebugEnabled) return
    const camera = cameraRef.current
    const selectionMask = pattern?.selection?.mask
    const selectionSelected = selectionMask ? countSelected(selectionMask) : -1
    const selectionTotal = selectionMask ? selectionMask.length : -1
    const stitchedCount = pattern ? pattern.stitches.reduce((acc, stitch) => acc + (stitch.dmcCode !== 'Fabric' ? 1 : 0), 0) : -1
    const totalStitches = pattern ? pattern.stitches.length : -1
    const worldCenter = {
      x: (camera.panX * -1 + (containerRef.current?.clientWidth ?? 0) / 2) / Math.max(camera.zoom, 0.0001),
      y: (camera.panY * -1 + (containerRef.current?.clientHeight ?? 0) / 2) / Math.max(camera.zoom, 0.0001),
    }
    setCameraDebugText(
      [
        `selPx: ${selectionSelected >= 0 ? selectionSelected : 'none'} / ${selectionTotal >= 0 ? selectionTotal : 'none'}`,
        `stitches: ${stitchedCount >= 0 ? stitchedCount : 'none'} / ${totalStitches >= 0 ? totalStitches : 'none'}`,
        `zoom: ${camera.zoom.toFixed(4)}`,
        `pan: ${camera.panX.toFixed(2)}, ${camera.panY.toFixed(2)}`,
        `center: ${worldCenter.x.toFixed(2)}, ${worldCenter.y.toFixed(2)}`,
        `world: ${worldSizeRef.current.width} x ${worldSizeRef.current.height}`,
      ].join('\n')
    )
    if (!pointer || !pattern) {
      setPointerDebugText('')
      return
    }
    const world = screenToWorld(camera, { x: pointer.screenX, y: pointer.screenY })
    setPointerDebugText(
      `pointer world: ${world.x.toFixed(2)}, ${world.y.toFixed(2)}\npointer image: ${Math.floor(world.x / VIEWER.CELL_SIZE)}, ${Math.floor(world.y / VIEWER.CELL_SIZE)}`
    )
  }, [cameraDebugEnabled, pattern])

  const applyCameraToWorld = useCallback((nextCamera: CameraState) => {
    cameraRef.current = nextCamera
    const worldContainer = worldContainerRef.current
    if (!worldContainer) return
    worldContainer.scale.set(nextCamera.zoom)
    worldContainer.position.set(nextCamera.panX, nextCamera.panY)
    updateDebugText()
  }, [updateDebugText])

  const commitCamera = useCallback((nextCamera: CameraState) => {
    setViewerCamera(nextCamera)
  }, [setViewerCamera])

  const scheduleCameraCommit = useCallback((nextCamera: CameraState) => {
    if (pendingCameraCommitFrameRef.current !== null) return
    pendingCameraCommitFrameRef.current = window.requestAnimationFrame(() => {
      pendingCameraCommitFrameRef.current = null
      commitCamera(nextCamera)
    })
  }, [commitCamera])

  const fitCameraNow = useCallback((isManualRequest: boolean) => {
    const host = containerRef.current
    if (!host) return
    const nextCamera = fitCameraToWorld(
      {
        ...cameraRef.current,
        isFitted: isManualRequest || cameraRef.current.isFitted,
      },
      { width: host.clientWidth || window.innerWidth, height: host.clientHeight || window.innerHeight },
      { width: worldSizeRef.current.width, height: worldSizeRef.current.height },
      12
    )
    applyCameraToWorld(nextCamera)
    commitCamera(nextCamera)
  }, [applyCameraToWorld, commitCamera])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let canceled = false
    let resizeObserver: ResizeObserver | null = null

    const handleResize = () => {
      const app = appRef.current
      const host = containerRef.current
      if (!app || !host) return

      const width = host.clientWidth || window.innerWidth
      const height = host.clientHeight || window.innerHeight
      app.renderer.resize(width, height)
      if (cameraRef.current.isFitted) {
        fitCameraNow(false)
      } else {
        updateDebugText()
      }
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
        // 1) Create App + world container once.
        // 2) Render pattern into world container when data changes.
        // 3) Re-fit on first pattern render and on container resize.
        const worldContainer = new PIXI.Container()
        app.stage.addChild(worldContainer)

        pixiRef.current = PIXI
        worldContainerRef.current = worldContainer
        containerRef.current.appendChild(app.canvas)
        appRef.current = app
        applyCameraToWorld(cameraRef.current)
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
      worldContainerRef.current = null
      pixiRef.current = null
      worldSizeRef.current = { width: 1, height: 1 }
      setIsReady(false)
      setCameraDebugText('')
      setPointerDebugText('')
    }
  }, [applyCameraToWorld, fitCameraNow, isDev, updateDebugText])

  const handleFitToView = () => {
    if (!pattern || !cameraInteractionEnabled) return
    fitCameraNow(true)
  }

  const handleResetZoom = () => {
    const host = containerRef.current
    if (!host) return
    const nextCamera: CameraState = {
      ...cameraRef.current,
      zoom: 1,
      panX: (host.clientWidth - worldSizeRef.current.width) / 2,
      panY: (host.clientHeight - worldSizeRef.current.height) / 2,
      isFitted: false,
    }
    applyCameraToWorld(nextCamera)
    commitCamera(nextCamera)
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
    if (!pattern) return null
    const selectedPaint = paintOptions.find((option) => option.id === selectedPaintValue)
    if (editTool === 'paint' && !selectedPaint) return null

    const bounds = event.currentTarget.getBoundingClientRect()
    const screenX = event.clientX - bounds.left
    const screenY = event.clientY - bounds.top
    const world = screenToWorld(cameraRef.current, { x: screenX, y: screenY })
    updateDebugText({ screenX, screenY })
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
  }, [editTool, paintOptions, pattern, selectedPaintValue, updateDebugText])

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
    if (shouldStartPan(event)) {
      startPan(event)
      return
    }
    if (event.button !== 0) return
    isEditingStrokeRef.current = true
    queueEditFromPointer(event)
    event.currentTarget.setPointerCapture(event.pointerId)
  }, [queueEditFromPointer, shouldStartPan, startPan])

  const handleEditPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (isPanningRef.current) {
      updatePan(event)
      return
    }
    if (!isEditingStrokeRef.current) return
    queueEditFromPointer(event)
  }, [queueEditFromPointer, updatePan])

  const endEditStroke = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (isPanningRef.current) {
      endPan(event)
      return
    }
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
  }, [endPan, flushPendingManualEdits])

  const getRegionIdFromPointer = useCallback((event: React.PointerEvent<HTMLDivElement>): number | null => {
    if (!buildArtifact) return null
    const bounds = event.currentTarget.getBoundingClientRect()
    const screenX = event.clientX - bounds.left
    const screenY = event.clientY - bounds.top
    const world = screenToWorld(cameraRef.current, { x: screenX, y: screenY })
    updateDebugText({ screenX, screenY })
    const x = Math.floor(world.x / VIEWER.CELL_SIZE)
    const y = Math.floor(world.y / VIEWER.CELL_SIZE)
    if (x < 0 || y < 0 || x >= buildArtifact.width || y >= buildArtifact.height) return null
    const regionId = buildArtifact.pixelRegionId[y * buildArtifact.width + x]
    return regionId > 0 ? regionId : null
  }, [buildArtifact, updateDebugText])

  const handleRegionPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (isPanningRef.current) {
      updatePan(event)
      return
    }
    const nextRegionId = getRegionIdFromPointer(event)
    if (nextRegionId !== hoverRegionId) {
      setHoverRegionId(nextRegionId)
    }
  }, [getRegionIdFromPointer, hoverRegionId, setHoverRegionId, updatePan])

  const handleRegionPointerLeave = useCallback(() => {
    if (hoverRegionId !== null) {
      setHoverRegionId(null)
    }
  }, [hoverRegionId, setHoverRegionId])

  const handleRegionPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (shouldStartPan(event)) {
      startPan(event)
      return
    }
    const regionId = getRegionIdFromPointer(event)
    if (regionId === null) {
      setActiveRegionId(null)
      return
    }
    setActiveRegionId(regionId)
    if (event.detail >= 2) {
      toggleRegionDone(regionId)
    }
  }, [getRegionIdFromPointer, setActiveRegionId, shouldStartPan, startPan, toggleRegionDone])

  function shouldStartPan(event: React.PointerEvent<HTMLDivElement>): boolean {
    const isMiddleOrRight = event.button === 1 || event.button === 2
    const isSpacePan = spacePressedRef.current && event.button === 0
    return isMiddleOrRight || isSpacePan
  }

  function startPan(event: React.PointerEvent<HTMLDivElement>): boolean {
    if (!cameraInteractionEnabled) return false
    isPanningRef.current = true
    panPointerIdRef.current = event.pointerId
    panStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      panX: cameraRef.current.panX,
      panY: cameraRef.current.panY,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    return true
  }

  function updatePan(event: React.PointerEvent<HTMLDivElement>): void {
    if (!isPanningRef.current || panPointerIdRef.current !== event.pointerId || !panStartRef.current) return
    const nextCamera: CameraState = {
      ...cameraRef.current,
      panX: panStartRef.current.panX + (event.clientX - panStartRef.current.x),
      panY: panStartRef.current.panY + (event.clientY - panStartRef.current.y),
      isFitted: false,
    }
    applyCameraToWorld(nextCamera)
    scheduleCameraCommit(nextCamera)
    const bounds = event.currentTarget.getBoundingClientRect()
    updateDebugText({ screenX: event.clientX - bounds.left, screenY: event.clientY - bounds.top })
  }

  function endPan(event: React.PointerEvent<HTMLDivElement>): void {
    if (!isPanningRef.current || panPointerIdRef.current !== event.pointerId) return
    isPanningRef.current = false
    panPointerIdRef.current = null
    panStartRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    commitCamera(cameraRef.current)
  }

  const handleCameraWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    if (!cameraInteractionEnabled) return
    event.preventDefault()
    const bounds = event.currentTarget.getBoundingClientRect()
    const screen = {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    }
    let nextCamera = cameraRef.current
    if (event.metaKey || event.ctrlKey) {
      const factor = Math.exp(-event.deltaY * 0.002)
      nextCamera = zoomAtCursor({
        camera: nextCamera,
        cursor: screen,
        screen: { width: bounds.width, height: bounds.height },
        factor,
      })
    } else {
      nextCamera = {
        ...nextCamera,
        panX: nextCamera.panX - event.deltaX,
        panY: nextCamera.panY - event.deltaY,
        isFitted: false,
      }
    }
    applyCameraToWorld(nextCamera)
    scheduleCameraCommit(nextCamera)
    updateDebugText({ screenX: screen.x, screenY: screen.y })
  }, [applyCameraToWorld, cameraInteractionEnabled, scheduleCameraCommit, updateDebugText])

  const handleNavPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!shouldStartPan(event)) return
    startPan(event)
  }, [])

  const handleNavPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    updatePan(event)
  }, [])

  const handleNavPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    endPan(event)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spacePressedRef.current = true
      }
      if (e.key === 'Escape') {
        setHighlightColorKey(null)
      }
      if (!cameraInteractionEnabled) return
      if (e.key !== '+' && e.key !== '=' && e.key !== '-' && e.key !== '_') return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const host = containerRef.current
      if (!host) return
      const rect = host.getBoundingClientRect()
      const center = { x: rect.width / 2, y: rect.height / 2 }
      const factor = e.key === '-' || e.key === '_' ? 0.9 : 1.1
      const nextCamera = zoomAtCursor({
        camera: cameraRef.current,
        cursor: center,
        screen: { width: rect.width, height: rect.height },
        factor,
      })
      applyCameraToWorld(nextCamera)
      commitCamera(nextCamera)
      e.preventDefault()
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spacePressedRef.current = false
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [applyCameraToWorld, cameraInteractionEnabled, commitCamera, setHighlightColorKey])

  useEffect(() => () => {
    if (pendingEditFrameRef.current !== null) {
      window.cancelAnimationFrame(pendingEditFrameRef.current)
      pendingEditFrameRef.current = null
    }
    if (pendingCameraCommitFrameRef.current !== null) {
      window.cancelAnimationFrame(pendingCameraCommitFrameRef.current)
      pendingCameraCommitFrameRef.current = null
    }
    pendingStrokeEditsRef.current.clear()
  }, [])

  useEffect(() => {
    cameraRef.current = viewerCamera
    applyCameraToWorld(viewerCamera)
  }, [applyCameraToWorld, viewerCamera])

  useEffect(() => {
    if (!isReady) return
    if (!appRef.current || !containerRef.current || !pixiRef.current || !worldContainerRef.current) {
      return
    }

    if (!pattern) {
      worldContainerRef.current.removeChildren()
      worldSizeRef.current = { width: 1, height: 1 }
      fitCameraNow(false)
      return
    }

    const worldWidth = pattern.width * VIEWER.CELL_SIZE
    const worldHeight = pattern.height * VIEWER.CELL_SIZE
    const worldSizeChanged =
      worldSizeRef.current.width !== worldWidth || worldSizeRef.current.height !== worldHeight
    worldSizeRef.current = { width: worldWidth, height: worldHeight }

    worldContainerRef.current.removeChildren()
    renderPattern(pixiRef.current, worldContainerRef.current, pattern, {
      activeTab,
      showStitchedOnly,
      showGrid,
      showLabels,
      showOutlines,
      config: processingConfig,
      selection: pattern.selection,
      paths, // Pass memoized paths
      buildArtifact,
      viewMode,
      highlightColorKey,
      activeRegionId,
      doneRegionIds,
      onClearHighlight: () => setHighlightColorKey(null),
    })
    if (isEditingStrokeRef.current) {
      incrementDevCounter('pixiRedrawsDuringDrag')
    }
    if (worldSizeChanged && cameraRef.current.isFitted) {
      fitCameraNow(false)
    } else {
      applyCameraToWorld(cameraRef.current)
      updateDebugText()
    }
  }, [
    applyCameraToWorld,
    isReady,
    pattern,
    activeTab,
    showStitchedOnly,
    showGrid,
    showLabels,
    showOutlines,
    processingConfig,
    paths,
    buildArtifact,
    viewMode,
    highlightColorKey,
    activeRegionId,
    doneRegionIds,
    fitCameraNow,
    setHighlightColorKey,
    updateDebugText,
  ])

  useEffect(() => {
    if (!isReady || !pixiRef.current || !worldContainerRef.current || !buildArtifact) return
    if (workflowStage !== 'Build' || activeTab !== 'pattern' || viewMode !== 'Regions') return
    if (!hoverRegionId) return

    const region = buildArtifact.regions[hoverRegionId - 1]
    if (!region) return

    const overlay = new pixiRef.current.Graphics()
    const regionSegments = buildArtifact.outlineSegmentsByRegionId?.[region.id]
    if (regionSegments) {
      drawBoundarySegments(overlay, regionSegments, VIEWER.CELL_SIZE)
    } else {
      drawRegionBoundaries(
        overlay,
        buildArtifact.pixelRegionId,
        buildArtifact.width,
        buildArtifact.height,
        VIEWER.CELL_SIZE,
        (id) => id === region.id
      )
    }
    overlay.setStrokeStyle({ width: 2.2, color: 0x111827, alpha: 0.95 })
    overlay.stroke()
    overlay.label = 'hover-overlay'
    worldContainerRef.current.addChild(overlay)

    return () => {
      overlay.destroy()
    }
  }, [activeTab, buildArtifact, hoverRegionId, isReady, viewMode, workflowStage])

  if (viewerError) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-surface-2 text-sm text-red-600">
        {viewerError}
      </div>
    )
  }

  return (
    <div
      className="relative h-full w-full"
      onWheel={handleCameraWheel}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div
        ref={containerRef}
        className="h-full w-full"
        style={{ touchAction: 'none' }}
      />

      {/* 
        The following UI overlays are only rendered if NOT controlled. 
        If controlled, the parent stage is responsible for rendering its own UI.
      */}
      {!controlledActiveTab && (
        <div className="absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-lg border border-border bg-overlay/95 p-1 shadow-sm backdrop-blur">
          <SegmentedControl
            value={activeTab}
            onValueChange={setActiveTab}
            options={[
              { value: 'finished', label: 'Finished' },
              { value: 'pattern', label: 'Pattern' },
            ]}
            ariaLabel="Viewer mode"
          />
        </div>
      )}

      {!controlledActiveTab && (
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
      )}

      {cameraInteractionEnabled && (
        <div className="absolute right-4 top-4 z-10">
          <div className="flex items-center gap-1 rounded-lg border border-border bg-overlay/95 p-1 shadow-sm backdrop-blur">
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
            <Button
              type="button"
              onClick={handleResetZoom}
              disabled={!pattern}
              size="sm"
              variant="secondary"
              className="min-w-14"
            >
              100%
            </Button>
          </div>
        </div>
      )}

      {!controlledActiveTab && activeTab === 'pattern' && editModeEnabled && (
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
      {cameraInteractionEnabled && (
        <div
          className={`absolute inset-0 z-[3] touch-none ${(spacePressedRef.current || isPanningRef.current) ? 'pointer-events-auto cursor-grab' : 'pointer-events-none'}`}
          onPointerDown={handleNavPointerDown}
          onPointerMove={handleNavPointerMove}
          onPointerUp={handleNavPointerUp}
          onPointerCancel={handleNavPointerUp}
        />
      )}
      {workflowStage === 'Build' &&
        activeTab === 'pattern' &&
        viewMode === 'Regions' &&
        !editModeEnabled &&
        buildArtifact && (
          <div
            className="absolute inset-0 z-[4] touch-none"
            onPointerMove={handleRegionPointerMove}
            onPointerDown={handleRegionPointerDown}
            onPointerUp={handleNavPointerUp}
            onPointerLeave={handleRegionPointerLeave}
            onPointerCancel={(event) => {
              handleRegionPointerLeave()
              handleNavPointerUp(event)
            }}
          />
        )}
      {cameraDebugEnabled && cameraDebugText && (
        <pre className="pointer-events-none absolute top-14 left-4 z-10 whitespace-pre rounded-md border border-border bg-overlay/95 px-3 py-2 font-mono text-[11px] leading-4 text-fg-muted shadow-sm">
          {cameraDebugText}
          {pointerDebugText ? `\n${pointerDebugText}` : ''}
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
  buildArtifact?: BuildArtifact | null
  viewMode?: 'Regions' | 'Grid'
  highlightColorKey?: string | null
  activeRegionId?: number | null
  hoverRegionId?: number | null
  doneRegionIds?: number[]
  onClearHighlight?: () => void
}

function renderPattern(
  PIXI: typeof PIXINamespace,
  viewport: PIXINamespace.Container,
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
  viewport: PIXINamespace.Container,
  pattern: Pattern,
  options: RenderOptions
) {
  const { buildArtifact, highlightColorKey, showOutlines, showLabels, activeRegionId, doneRegionIds } = options
  if (!buildArtifact || buildArtifact.regions.length === 0) {
    // Fallback to pattern preview if no regions yet
    renderPatternPreview(PIXI, viewport, pattern, options)
    return
  }

  const cellSize = VIEWER.CELL_SIZE
  const doneSet = new Set(doneRegionIds ?? [])

  if (showOutlines) {
    const outlines = new PIXI.Graphics()
    if (buildArtifact.allBoundarySegments) {
      drawBoundarySegments(outlines, buildArtifact.allBoundarySegments, cellSize)
    } else {
      drawRegionBoundaries(outlines, buildArtifact.pixelRegionId, buildArtifact.width, buildArtifact.height, cellSize, () => true)
    }
    outlines.setStrokeStyle({ width: 0.85, color: 0x9ca3af, alpha: 0.55 })
    outlines.stroke()
    viewport.addChild(outlines)
  }

  if (highlightColorKey) {
    const dim = new PIXI.Graphics()
    dim.rect(0, 0, buildArtifact.width * cellSize, buildArtifact.height * cellSize)
    dim.fill({ color: 0xffffff, alpha: 0.78 })
    viewport.addChild(dim)
  }

  for (const region of buildArtifact.regions) {
    const isHighlighted = highlightColorKey === region.colorKey
    const isActive = activeRegionId === region.id
    const isDone = doneSet.has(region.id)
    if (!isHighlighted && !isActive && !isDone) continue
    const shouldDrawFill = isHighlighted || isActive
    if (shouldDrawFill) {
      const color = parseInt(region.hex.slice(1), 16)
      const fill = new PIXI.Graphics()
      drawRegionFill(fill, buildArtifact.pixelRegionId, buildArtifact.width, region.id, region.bbox, cellSize)
      fill.fill({
        color,
        alpha: isActive ? 0.28 : 0.18,
      })
      viewport.addChild(fill)
    }

    const outline = new PIXI.Graphics()
    const regionSegments = buildArtifact.outlineSegmentsByRegionId?.[region.id]
    if (regionSegments) {
      drawBoundarySegments(outline, regionSegments, cellSize)
    } else {
      drawRegionBoundaries(outline, buildArtifact.pixelRegionId, buildArtifact.width, buildArtifact.height, cellSize, (id) => id === region.id)
    }
    outline.setStrokeStyle({
      width: isActive ? 2.1 : 1.45,
      color: isDone ? 0x065f46 : 0x111827,
      alpha: 0.95,
    })
    outline.stroke()
    viewport.addChild(outline)
  }

  if (showLabels && buildArtifact.labelPointByRegionId) {
    for (const region of buildArtifact.regions) {
      if (region.area <= 4 && highlightColorKey && region.colorKey !== highlightColorKey) continue
      const point = buildArtifact.labelPointByRegionId[region.id]
      if (!point) continue
      const isHighlighted = region.colorKey === highlightColorKey
      const isActive = activeRegionId === region.id
      const label = new PIXI.Text({
        text: (region.colorIndex + 1).toString(),
        style: {
          fontFamily: 'Menlo, Monaco, monospace',
          fontSize: Math.max(7, cellSize * 0.45),
          fill: 0x000000,
          align: 'center',
          fontWeight: isActive || isHighlighted ? 'bold' : 'normal',
        },
      })
      label.alpha = highlightColorKey ? (isHighlighted ? 1 : 0.15) : 0.78
      label.anchor.set(0.5)
      label.position.set((point.x + 0.5) * cellSize, (point.y + 0.5) * cellSize)
      viewport.addChild(label)
    }
  }
}

function renderFinishedPreview(
  PIXI: typeof PIXINamespace,
  viewport: PIXINamespace.Container,
  pattern: Pattern,
  options: RenderOptions,
  fabricIndices: Set<number>
) {
  const { paths } = options
  const cellSize = VIEWER.CELL_SIZE

  if (pattern.labels && pattern.paletteHex && paths.length > 0) {
    // Prefer smooth filled regions for final-look preview.
    paths.forEach(path => {
      if (path.isFabric) return
      const color = parseInt(pattern.paletteHex![path.label].slice(1), 16)

      const poly = new PIXI.Graphics()
      poly.poly(path.points.map((p: Point) => ({ x: p.x * cellSize, y: p.y * cellSize })))
      poly.fill(color)
      viewport.addChild(poly)
    })
  } else {
    // Fallback when labels/paths are unavailable.
    const stitchLayer = new PIXI.Graphics()
    const mask = pattern.selection?.mask

    pattern.stitches.forEach((stitch, i) => {
      if (stitch.dmcCode === 'Fabric') return

      // Skip if explicitly masked out by user
      if (mask && mask[i] === 0) return

      const colorIdx = pattern.rawPalette.indexOf(stitch.hex.toUpperCase())
      if (fabricIndices.has(colorIdx)) return

      const color = parseInt(stitch.hex.slice(1), 16)
      stitchLayer.rect(stitch.x * cellSize, stitch.y * cellSize, cellSize, cellSize)
      stitchLayer.fill(color)
    })
    viewport.addChild(stitchLayer)
  }
}

function renderPatternPreview(
  PIXI: typeof PIXINamespace,
  viewport: PIXINamespace.Container,
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

function drawRegionFill(
  graphics: PIXINamespace.Graphics,
  pixelRegionId: Uint32Array,
  width: number,
  regionId: number,
  bbox: { x0: number; y0: number; x1: number; y1: number },
  cellSize: number
) {
  for (let y = bbox.y0; y <= bbox.y1; y += 1) {
    const rowOffset = y * width
    for (let x = bbox.x0; x <= bbox.x1; x += 1) {
      if (pixelRegionId[rowOffset + x] !== regionId) continue
      graphics.rect(x * cellSize, y * cellSize, cellSize, cellSize)
    }
  }
}

function drawBoundarySegments(
  graphics: PIXINamespace.Graphics,
  segments: number[],
  cellSize: number
) {
  for (let i = 0; i < segments.length; i += 4) {
    graphics.moveTo(segments[i] * cellSize, segments[i + 1] * cellSize)
    graphics.lineTo(segments[i + 2] * cellSize, segments[i + 3] * cellSize)
  }
}

function drawRegionBoundaries(
  graphics: PIXINamespace.Graphics,
  pixelRegionId: Uint32Array,
  width: number,
  height: number,
  cellSize: number,
  includeRegion: (regionId: number) => boolean
) {
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * width
    for (let x = 0; x < width; x += 1) {
      const idx = rowOffset + x
      const regionId = pixelRegionId[idx]
      if (regionId === 0 || !includeRegion(regionId)) continue
      const left = x === 0 ? 0 : pixelRegionId[idx - 1]
      const right = x + 1 >= width ? 0 : pixelRegionId[idx + 1]
      const up = y === 0 ? 0 : pixelRegionId[idx - width]
      const down = y + 1 >= height ? 0 : pixelRegionId[idx + width]
      const x0 = x * cellSize
      const y0 = y * cellSize
      const x1 = x0 + cellSize
      const y1 = y0 + cellSize

      if (left !== regionId) {
        graphics.moveTo(x0, y0)
        graphics.lineTo(x0, y1)
      }
      if (right !== regionId) {
        graphics.moveTo(x1, y0)
        graphics.lineTo(x1, y1)
      }
      if (up !== regionId) {
        graphics.moveTo(x0, y0)
        graphics.lineTo(x1, y0)
      }
      if (down !== regionId) {
        graphics.moveTo(x0, y1)
        graphics.lineTo(x1, y1)
      }
    }
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
