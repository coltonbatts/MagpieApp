import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { usePatternStore } from '@/store/pattern-store'
import { useUIStore } from '@/store/ui-store'
import { SelectionArtifactModel } from '@/model/SelectionArtifact'
import { StudioPreview } from './StudioPreview'
import { MaskLayer } from './MaskLayer'
import { Button, Input } from '@/components/ui'

export function SelectStage() {
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
    } = usePatternStore()
    const { setWorkflowStage } = useUIStore()
    const [tool, setTool] = useState<'brush' | 'eraser' | 'magic'>('brush')

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
                        <h2 className="text-xl font-bold tracking-tight text-fg">Define Stitch Area</h2>
                        <p className="text-sm text-fg-muted">Highlight the areas of your design that should be stitched.</p>
                    </header>

                    <section className="space-y-6">
                        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-fg-subtle">Selection Tool</h3>
                        <div className="grid grid-cols-2 gap-3">
                            <Button
                                variant={tool === 'brush' ? 'primary' : 'secondary'}
                                className={`h-20 flex-col gap-2 rounded-2xl transition-all ${tool === 'brush' ? 'shadow-lg ring-1 ring-primary/20' : ''}`}
                                onClick={() => setTool('brush')}
                            >
                                <span className="text-2xl">🖌️</span>
                                <span className="text-[10px] font-bold uppercase tracking-widest">Brush</span>
                            </Button>
                            <Button
                                variant={tool === 'eraser' ? 'primary' : 'secondary'}
                                className={`h-20 flex-col gap-2 rounded-2xl transition-all ${tool === 'eraser' ? 'shadow-lg ring-1 ring-primary/20' : ''}`}
                                onClick={() => setTool('eraser')}
                            >
                                <span className="text-2xl">🧽</span>
                                <span className="text-[10px] font-bold uppercase tracking-widest">Eraser</span>
                            </Button>
                        </div>

                        <Button
                            variant={tool === 'magic' ? 'primary' : 'secondary'}
                            className={`w-full h-12 flex-row gap-2 rounded-2xl transition-all ${tool === 'magic' ? 'shadow-lg ring-1 ring-primary/20 bg-gradient-to-r from-indigo-500/10 to-violet-500/10' : ''}`}
                            onClick={() => setTool('magic')}
                        >
                            <span className="text-xl">✨</span>
                            <span className="text-[10px] font-bold uppercase tracking-widest">Auto Select (Magic Wand)</span>
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
                                <div className="space-y-3">
                                    <div className="flex justify-between">
                                        <span className="text-xs font-medium text-fg-muted">Stickiness</span>
                                        <span className="text-[10px] font-mono text-fg-subtle">{magicWandConfig.tolerance}</span>
                                    </div>
                                    <Input
                                        variant="slider"
                                        min={1} max={100} step={1}
                                        value={magicWandConfig.tolerance}
                                        onChange={(e) => setMagicWandConfig({
                                            tolerance: parseInt(e.target.value),
                                            edgeStop: Math.max(10, parseInt(e.target.value) * 2)
                                        })}
                                    />
                                </div>

                                <div className="pt-4 border-t border-gray-100 flex flex-col gap-3">
                                    <div className="flex justify-between">
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-fg-subtle">Selection Refinement</span>
                                        <span className="text-[10px] font-mono text-fg-subtle">{refinementConfig.strength}%</span>
                                    </div>
                                    <Input
                                        variant="slider"
                                        min={0} max={100} step={1}
                                        value={refinementConfig.strength}
                                        onChange={(e) => setRefinementConfig({ strength: parseInt(e.target.value) })}
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

                        <div className="space-y-6 pt-4">
                            <div className="space-y-3">
                                <div className="flex justify-between">
                                    <span className="text-xs font-medium text-fg-muted">Brush Diameter</span>
                                    <span className="text-[10px] font-mono text-fg-subtle">{maskConfig.brushSize}px</span>
                                </div>
                                <Input
                                    variant="slider"
                                    min={5} max={150} step={1}
                                    value={maskConfig.brushSize}
                                    onChange={(e) => setMaskConfig({ brushSize: parseInt(e.target.value) })}
                                />
                            </div>
                            <div className="space-y-3">
                                <div className="flex justify-between">
                                    <span className="text-xs font-medium text-fg-muted">Overlay Tint</span>
                                    <span className="text-[10px] font-mono text-fg-subtle">{Math.round(maskConfig.opacity * 100)}%</span>
                                </div>
                                <Input
                                    variant="slider"
                                    min={0.1} max={1} step={0.01}
                                    value={maskConfig.opacity}
                                    onChange={(e) => setMaskConfig({ opacity: parseFloat(e.target.value) })}
                                />
                            </div>
                        </div>
                    </section>

                    <section className="space-y-2.5 pt-6 border-t border-border/50">
                        <div className="grid grid-cols-2 gap-2.5">
                            <Button variant="secondary" size="sm" onClick={handleSelectAll} className="h-9 text-[9px] uppercase font-bold tracking-widest">Select All</Button>
                            <Button variant="secondary" size="sm" onClick={handleClearAll} className="h-9 text-[9px] uppercase font-bold tracking-widest">Clear All</Button>
                        </div>
                        <Button variant="secondary" size="sm" onClick={handleInvert} className="w-full h-9 text-[9px] uppercase font-bold tracking-widest">Invert Selection</Button>
                    </section>

                    <div className="flex-1 flex flex-col justify-end gap-3 pb-4">
                        <div className="flex gap-3">
                            <Button
                                className="flex-1 h-12 text-sm font-bold tracking-tight"
                                variant="secondary"
                                onClick={() => setWorkflowStage('Reference')}
                            >
                                Back
                            </Button>
                            <Button
                                className="flex-[2] h-12 text-sm font-bold tracking-tight shadow-xl"
                                variant="primary"
                                onClick={() => setWorkflowStage('Build')}
                            >
                                Continue to Build
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main View: Studio Preview with Alignment Persistence */}
            <div className="flex-1 bg-surface-2 relative flex items-center justify-center p-12 overflow-hidden shadow-inner">
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
                        onMaskChange={() => { }} // Store update deferred to commit for performance
                        onCommit={(finalMask) => handleCommit(finalMask)}
                    />
                </StudioPreview>

                {/* Footnote */}
                <div className="absolute bottom-12 right-12 px-4 py-2 bg-white/50 backdrop-blur-md rounded-lg border border-white/20 pointer-events-none">
                    <span className="text-[10px] font-bold text-fg-subtle uppercase tracking-widest">
                        Assembly Mode: Selection
                    </span>
                </div>
            </div>
        </div>
    )
}
