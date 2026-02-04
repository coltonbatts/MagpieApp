import React, { useState } from 'react'
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
        fabricSetup,
        referencePlacement,
        setSelection,
        maskConfig,
        setMaskConfig
    } = usePatternStore()
    const { setWorkflowStage } = useUIStore()
    const [tool, setTool] = useState<'brush' | 'eraser'>('brush')

    // Initialize selection if it doesn't exist
    React.useEffect(() => {
        if (selectionWorkingImage && referenceId && !selection) {
            setSelection(SelectionArtifactModel.createDefault(
                selectionWorkingImage.width,
                selectionWorkingImage.height,
                referenceId
            ))
        }
    }, [selectionWorkingImage, referenceId, selection, setSelection])

    const handleCommit = (finalMask: Uint8Array) => {
        if (!selection) return
        setSelection(SelectionArtifactModel.updateMask(selection, finalMask))
    }

    const handleAutoSubject = () => {
        if (!selectionWorkingImage || !selection) return
        const { width, height } = selectionWorkingImage
        const newMask = new Uint8Array(width * height).fill(0)
        // Simple center-weighted "Magic" heuristic for initial view
        for (let y = Math.floor(height * 0.25); y < height * 0.75; y++) {
            for (let x = Math.floor(width * 0.25); x < width * 0.75; x++) {
                newMask[y * width + x] = 1
            }
        }
        handleCommit(newMask)
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
                        <Button
                            onClick={handleAutoSubject}
                            className="w-full h-12 text-[10px] font-bold tracking-[0.2em] uppercase bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-xl border-0"
                        >
                            ✨ Smart Selection
                        </Button>
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
