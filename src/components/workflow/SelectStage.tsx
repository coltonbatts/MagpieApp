import { useState, useEffect, useCallback, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { usePatternStore } from '@/store/pattern-store'
import { useUIStore } from '@/store/ui-store'
import { SelectionArtifactModel } from '@/model/SelectionArtifact'
import { StudioPreview } from './StudioPreview'
import { MaskLayer } from './MaskLayer'
import { Button, Slider } from '@/components/ui'
import type { CameraState } from '@/types'
import { fitCameraToWorld, zoomAtCursor } from '@/lib/camera'

export function SelectStage() {
    const cameraDebugEnabled = import.meta.env.DEV && window.localStorage.getItem('magpie:cameraDebug') === '1'
    const {
        selectionWorkingImage,
        referenceId,
        selection,
        setSelection,
        selectionMode,
        setSelectionMode,
        magicWandConfig,
        setMagicWandConfig,
        refinementConfig,
        setRefinementConfig,
        selectionWorkspaceId,
        setSelectionWorkspaceId,
        maskConfig,
        setMaskConfig,
        fabricSetup,
        referencePlacement,
        setCompositionLocked,
    } = usePatternStore()
    const selectCamera = useUIStore((state) => state.selectCamera)
    const setSelectCamera = useUIStore((state) => state.setSelectCamera)
    const { setWorkflowStage } = useUIStore()
    const [tool, setTool] = useState<'brush' | 'eraser' | 'magic'>('brush')
    const worldRef = useRef<HTMLDivElement | null>(null)
    const viewportRef = useRef<HTMLDivElement | null>(null)
    const cameraRef = useRef<CameraState>(selectCamera)
    const pendingCameraCommitFrameRef = useRef<number | null>(null)
    const isPanningRef = useRef(false)
    const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)
    const [spacePressed, setSpacePressed] = useState(false)
    const [cameraVersion, setCameraVersion] = useState(0)
    const [pointerImage, setPointerImage] = useState<{ x: number; y: number } | null>(null)

    useEffect(() => {
        // Stage 3 locks composition transforms; only camera navigation is allowed.
        setCompositionLocked(true)
    }, [setCompositionLocked])

    // Initialize selection if it doesn't exist
    useEffect(() => {
        if (selectionWorkingImage && referenceId && !selection) {
            setSelection(SelectionArtifactModel.createDefault(
                selectionWorkingImage.width,
                selectionWorkingImage.height,
                referenceId
            ))
        }
    }, [selectionWorkingImage, referenceId, selection, setSelection])

    // Initialize Rust selection workspace
    useEffect(() => {
        let isMounted = true
        if (selectionWorkingImage && referenceId) {
            const initWorkspace = async () => {
                try {
                    const workspaceId = `ws-${referenceId}`
                    await invoke('init_selection_workspace', {
                        imageRgba: Array.from(selectionWorkingImage.data),
                        width: selectionWorkingImage.width,
                        height: selectionWorkingImage.height,
                        workspaceId
                    })
                    if (isMounted) setSelectionWorkspaceId(workspaceId)
                } catch (err) {
                    console.error('Failed to initialize selection workspace:', err)
                }
            }
            initWorkspace()
        }
        return () => { isMounted = false }
    }, [selectionWorkingImage, referenceId, setSelectionWorkspaceId])

    const applyCamera = useCallback((nextCamera: CameraState) => {
        cameraRef.current = nextCamera
        const world = worldRef.current
        if (!world) return
        world.style.transform = `translate(${nextCamera.panX}px, ${nextCamera.panY}px) scale(${nextCamera.zoom})`
        setCameraVersion((v) => v + 1)
    }, [])

    const commitCamera = useCallback((nextCamera: CameraState) => {
        setSelectCamera(nextCamera)
    }, [setSelectCamera])

    const scheduleCameraCommit = useCallback((nextCamera: CameraState) => {
        if (pendingCameraCommitFrameRef.current !== null) return
        pendingCameraCommitFrameRef.current = window.requestAnimationFrame(() => {
            pendingCameraCommitFrameRef.current = null
            commitCamera(nextCamera)
        })
    }, [commitCamera])

    const fitCamera = useCallback((manual = false) => {
        const viewport = viewportRef.current
        if (!viewport) return
        const nextCamera = fitCameraToWorld(
            {
                ...cameraRef.current,
                isFitted: manual || cameraRef.current.isFitted,
            },
            { width: viewport.clientWidth, height: viewport.clientHeight },
            { width: viewport.clientWidth, height: viewport.clientHeight },
            0
        )
        applyCamera(nextCamera)
        commitCamera(nextCamera)
    }, [applyCamera, commitCamera])

    useEffect(() => {
        applyCamera(selectCamera)
    }, [applyCamera, selectCamera])

    useEffect(() => {
        const viewport = viewportRef.current
        if (!viewport) return

        if (cameraRef.current.isFitted) {
            fitCamera(false)
        }

        const onResize = () => {
            if (cameraRef.current.isFitted) fitCamera(false)
        }
        const observer = new ResizeObserver(onResize)
        observer.observe(viewport)
        return () => observer.disconnect()
    }, [fitCamera])

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.code === 'Space') setSpacePressed(true)
            if (!viewportRef.current) return
            if (event.key !== '+' && event.key !== '=' && event.key !== '-' && event.key !== '_') return
            if (event.metaKey || event.ctrlKey || event.altKey) return
            const rect = viewportRef.current.getBoundingClientRect()
            const factor = event.key === '-' || event.key === '_' ? 0.9 : 1.1
            const next = zoomAtCursor({
                camera: cameraRef.current,
                cursor: { x: rect.width / 2, y: rect.height / 2 },
                screen: { width: rect.width, height: rect.height },
                factor
            })
            applyCamera(next)
            commitCamera(next)
            event.preventDefault()
        }
        const onKeyUp = (event: KeyboardEvent) => {
            if (event.code === 'Space') setSpacePressed(false)
        }
        window.addEventListener('keydown', onKeyDown)
        window.addEventListener('keyup', onKeyUp)
        return () => {
            window.removeEventListener('keydown', onKeyDown)
            window.removeEventListener('keyup', onKeyUp)
        }
    }, [applyCamera, commitCamera])

    useEffect(() => () => {
        if (pendingCameraCommitFrameRef.current !== null) {
            window.cancelAnimationFrame(pendingCameraCommitFrameRef.current)
            pendingCameraCommitFrameRef.current = null
        }
    }, [])

    const handleWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
        const viewport = viewportRef.current
        if (!viewport) return
        event.preventDefault()
        const rect = viewport.getBoundingClientRect()
        const cursor = { x: event.clientX - rect.left, y: event.clientY - rect.top }
        let next = cameraRef.current
        if (event.metaKey || event.ctrlKey) {
            next = zoomAtCursor({
                camera: next,
                cursor,
                screen: { width: rect.width, height: rect.height },
                factor: Math.exp(-event.deltaY * 0.002)
            })
        } else {
            next = {
                ...next,
                panX: next.panX - event.deltaX,
                panY: next.panY - event.deltaY,
                isFitted: false,
            }
        }
        applyCamera(next)
        scheduleCameraCommit(next)
    }, [applyCamera, scheduleCameraCommit])

    const handlePanDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        if (!spacePressed || event.button !== 0) return
        isPanningRef.current = true
        panStartRef.current = {
            x: event.clientX,
            y: event.clientY,
            panX: cameraRef.current.panX,
            panY: cameraRef.current.panY,
        }
        event.currentTarget.setPointerCapture(event.pointerId)
    }, [spacePressed])

    const handlePanMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        if (!isPanningRef.current || !panStartRef.current) return
        const next = {
            ...cameraRef.current,
            panX: panStartRef.current.panX + (event.clientX - panStartRef.current.x),
            panY: panStartRef.current.panY + (event.clientY - panStartRef.current.y),
            isFitted: false,
        }
        applyCamera(next)
        scheduleCameraCommit(next)
    }, [applyCamera, scheduleCameraCommit])

    const handlePanUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        if (!isPanningRef.current) return
        isPanningRef.current = false
        panStartRef.current = null
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId)
        }
        commitCamera(cameraRef.current)
    }, [commitCamera])

    const handleCommit = (finalMask: Uint8Array) => {
        if (!selection) return
        setSelection(SelectionArtifactModel.updateMask(selection, finalMask))
    }


    const handleInvert = () => {
        if (!selection) return
        const newMask = new Uint8Array(selection.mask.length)
        for (let i = 0; i < selection.mask.length; i++) {
            newMask[i] = selection.mask[i] === 1 ? 0 : 1
        }
        handleCommit(newMask)
    }

    const handleClearAll = () => {
        if (!selection) return
        handleCommit(new Uint8Array(selection.mask.length).fill(0))
    }

    const handleSelectAll = () => {
        if (!selection) return
        handleCommit(new Uint8Array(selection.mask.length).fill(1))
    }

    if (!selectionWorkingImage || !selection || !referencePlacement) {
        return (
            <div className="flex h-full w-full items-center justify-center bg-bg">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-fg-subtle">
                        Initializing Studio Engine
                    </span>
                </div>
            </div>
        )
    }

    return (
        <div className="flex h-full w-full overflow-hidden bg-bg">
            {/* Sidebar: Masking tools */}
            <div className="w-[340px] flex-shrink-0 border-r border-border bg-surface flex flex-col overflow-y-auto">
                <div className="p-6 space-y-8">
                    <header>
                        <h2 className="text-xl font-bold tracking-tight text-fg">Choose What to Stitch</h2>
                        <p className="text-sm text-fg-muted">Mark areas to keep. Everything else will remain as fabric.</p>
                    </header>

                    <section className="space-y-6">
                        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-fg-subtle">Tools</h3>
                        <div className="grid grid-cols-2 gap-3">
                            <Button
                                variant={tool === 'brush' ? 'primary' : 'secondary'}
                                className={`h-20 flex-col gap-2 rounded-2xl transition-all ${tool === 'brush' ? 'shadow-lg ring-1 ring-primary/20' : ''}`}
                                onClick={() => setTool('brush')}
                            >
                                <span className="text-2xl">🖌️</span>
                                <span className="text-[10px] font-bold uppercase tracking-widest">Keep</span>
                            </Button>
                            <Button
                                variant={tool === 'eraser' ? 'primary' : 'secondary'}
                                className={`h-20 flex-col gap-2 rounded-2xl transition-all ${tool === 'eraser' ? 'shadow-lg ring-1 ring-primary/20' : ''}`}
                                onClick={() => setTool('eraser')}
                            >
                                <span className="text-2xl">🧽</span>
                                <span className="text-[10px] font-bold uppercase tracking-widest">Remove</span>
                            </Button>
                        </div>

                        <Button
                            variant={tool === 'magic' ? 'primary' : 'secondary'}
                            className={`w-full h-12 flex-row gap-2 rounded-2xl transition-all ${tool === 'magic' ? 'shadow-lg ring-1 ring-primary/20 bg-gradient-to-r from-indigo-500/10 to-violet-500/10' : ''}`}
                            onClick={() => setTool('magic')}
                        >
                            <span className="text-xl">✨</span>
                            <span className="text-[10px] font-bold uppercase tracking-widest">Auto Keep</span>
                        </Button>

                        {tool === 'magic' && (
                            <div className="space-y-4 pt-2 animate-in fade-in slide-in-from-top-2 duration-300">
                                <div className="grid grid-cols-3 gap-2">
                                    {(['replace', 'add', 'subtract'] as const).map((m) => (
                                        <Button
                                            key={m}
                                            variant={selectionMode === m ? 'primary' : 'secondary'}
                                            size="sm"
                                            className="h-8 text-[9px] uppercase font-bold"
                                            onClick={() => setSelectionMode(m)}
                                        >
                                            {m}
                                        </Button>
                                    ))}
                                </div>
                                <Slider
                                    label="Color Tolerance"
                                    min={1}
                                    max={100}
                                    step={1}
                                    value={magicWandConfig.tolerance}
                                    onChange={(v) => setMagicWandConfig({
                                        tolerance: v,
                                        edgeStop: Math.max(10, v * 2)
                                    })}
                                    formatValue={(v) => v.toString()}
                                />

                                <div className="pt-4 border-t border-gray-100 flex flex-col gap-3">
                                    <Slider
                                        label="Selection Refinement"
                                        min={0}
                                        max={100}
                                        step={1}
                                        value={refinementConfig.strength}
                                        onChange={(v) => setRefinementConfig({ strength: v })}
                                        formatValue={(v) => `${v}%`}
                                    />
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        className="w-full h-8 text-[9px] uppercase font-bold border-indigo-200/50 hover:bg-indigo-50/50"
                                        onClick={async () => {
                                            if (!selection) return
                                            try {
                                                const strength = refinementConfig.strength
                                                const params = {
                                                    min_island_area: Math.round(strength * 0.5 + 4),
                                                    hole_fill_area: Math.round(strength * 1.0 + 8),
                                                    smoothing_passes: strength > 50 ? 2 : 1
                                                }
                                                const refinedMask = await invoke<number[]>('refine_selection', {
                                                    mask: Array.from(selection.mask),
                                                    width: selection.width,
                                                    height: selection.height,
                                                    params
                                                })
                                                handleCommit(new Uint8Array(refinedMask))
                                            } catch (err) {
                                                console.error('Refinement failed:', err)
                                            }
                                        }}
                                    >
                                        🧹 Refine Current Mask
                                    </Button>
                                </div>
                            </div>
                        )}

                        <div className="space-y-5 pt-4">
                            <Slider
                                label="Brush Size"
                                min={5}
                                max={150}
                                step={1}
                                value={maskConfig.brushSize}
                                onChange={(v) => setMaskConfig({ brushSize: v })}
                                formatValue={(v) => `${v}px`}
                            />
                            <Slider
                                label="Removal Indicator"
                                min={0.1}
                                max={1}
                                step={0.01}
                                value={maskConfig.opacity}
                                onChange={(v) => setMaskConfig({ opacity: v })}
                                formatValue={(v) => `${Math.round(v * 100)}%`}
                            />
                        </div>
                    </section>

                    {selection && (
                        <section className="space-y-4 pt-6 border-t border-border/50">
                            <div className="rounded-lg bg-surface-2 p-3 border border-border/50">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-fg-subtle mb-2">Selection Stats</div>
                                {(() => {
                                    const selected = selection.mask.reduce((acc, val) => acc + val, 0)
                                    const total = selection.mask.length
                                    const percentage = total > 0 ? (selected / total * 100).toFixed(1) : '0'
                                    return (
                                        <div className="space-y-1">
                                            <div className="flex justify-between items-center">
                                                <span className="text-xs text-fg-muted">Will be stitched</span>
                                                <span className="text-sm font-bold text-fg">{percentage}%</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-xs text-fg-muted">Pixels</span>
                                                <span className="text-xs font-mono text-fg-subtle">{selected.toLocaleString()} / {total.toLocaleString()}</span>
                                            </div>
                                        </div>
                                    )
                                })()}
                            </div>
                            
                            <div className="grid grid-cols-2 gap-2.5">
                                <Button variant="secondary" size="sm" onClick={handleSelectAll} className="h-9 text-[9px] uppercase font-bold tracking-widest">Keep All</Button>
                                <Button variant="secondary" size="sm" onClick={handleClearAll} className="h-9 text-[9px] uppercase font-bold tracking-widest">Remove All</Button>
                            </div>
                            <Button variant="secondary" size="sm" onClick={handleInvert} className="w-full h-9 text-[9px] uppercase font-bold tracking-widest">Swap Keep/Remove</Button>
                        </section>
                    )}

                    <div className="flex-1 flex flex-col justify-end gap-3 pb-4">
                        <div className="flex gap-3">
                            <Button
                                className="flex-1 h-12 text-sm font-bold tracking-tight"
                                variant="secondary"
                                onClick={() => setWorkflowStage('Reference', { source: 'cta' })}
                            >
                                Back
                            </Button>
                            <Button
                                className="flex-[2] h-12 text-sm font-bold tracking-tight shadow-xl"
                                variant="primary"
                                onClick={() => {
                                    setCompositionLocked(true)
                                    setWorkflowStage('Build', { source: 'cta' })
                                }}
                            >
                                Continue to Build
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main View: Studio Preview with camera-only navigation */}
            <div
                ref={viewportRef}
                className="flex-1 bg-surface-2 relative flex items-center justify-center p-12 overflow-hidden shadow-inner"
                onWheel={handleWheel}
                onContextMenu={(event) => event.preventDefault()}
            >
                <div ref={worldRef} className="absolute inset-0 transform-gpu">
                    <StudioPreview fabricSetup={fabricSetup}>
                        <MaskLayer
                            image={selectionWorkingImage}
                            mask={selection.mask}
                            placement={referencePlacement}
                            config={maskConfig}
                            tool={tool}
                            magicWandConfig={magicWandConfig}
                            selectionWorkspaceId={selectionWorkspaceId}
                            selectionMode={selectionMode}
                            fabricColor={fabricSetup.color}
                            onMaskChange={() => { }} // Store update deferred to commit for performance
                            onCommit={(finalMask) => handleCommit(finalMask)}
                            onPointerSample={(sample) => setPointerImage(sample)}
                        />
                    </StudioPreview>
                </div>

                <div
                    className={`absolute inset-0 z-20 touch-none ${spacePressed || isPanningRef.current ? 'cursor-grab pointer-events-auto' : 'pointer-events-none'}`}
                    onPointerDown={handlePanDown}
                    onPointerMove={handlePanMove}
                    onPointerUp={handlePanUp}
                    onPointerCancel={handlePanUp}
                />

                <div className="absolute right-8 top-8 z-30 flex items-center gap-2 rounded-lg border border-border bg-overlay/95 p-1 shadow-sm backdrop-blur">
                    <Button type="button" size="sm" variant="secondary" className="min-w-14" onClick={() => fitCamera(true)}>
                        Fit
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="min-w-14"
                        onClick={() => {
                            const next = {
                                ...cameraRef.current,
                                zoom: 1,
                                panX: 0,
                                panY: 0,
                                isFitted: false,
                            }
                            applyCamera(next)
                            commitCamera(next)
                        }}
                    >
                        100%
                    </Button>
                </div>

                {/* Footnote */}
                <div className="absolute bottom-12 right-12 px-4 py-2 bg-white/50 backdrop-blur-md rounded-lg border border-white/20 pointer-events-none">
                    <span className="text-[10px] font-bold text-fg-subtle uppercase tracking-widest">
                        Assembly Mode: Selection
                    </span>
                </div>
                {cameraDebugEnabled && (
                    <pre className="pointer-events-none absolute left-8 top-8 z-30 whitespace-pre rounded-md border border-border bg-overlay/95 px-3 py-2 font-mono text-[11px] leading-4 text-fg-muted shadow-sm">
                        {`zoom: ${cameraRef.current.zoom.toFixed(3)}\npan: ${cameraRef.current.panX.toFixed(1)}, ${cameraRef.current.panY.toFixed(1)}\nimage: ${pointerImage ? `${pointerImage.x}, ${pointerImage.y}` : 'n/a'}\nrev: ${cameraVersion}`}
                    </pre>
                )}
            </div>
        </div>
    )
}
