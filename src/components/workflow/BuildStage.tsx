import { useState, useCallback, useMemo } from 'react'
import { usePatternStore } from '@/store/pattern-store'
import { useUIStore } from '@/store/ui-store'
import { PatternViewer } from '@/viewer/PatternViewer'
import { StudioPreview } from './StudioPreview'
import { Legend } from '../Legend'
import { Button, Slider, SegmentedControl, Toggle } from '@/components/ui'
import { PROCESSING } from '@/lib/constants'

export function BuildStage() {
    const {
        pattern,
        processingConfig,
        setProcessingConfig,
        isProcessing,
    } = usePatternStore()

    const {
        setWorkflowStage,
        viewMode,
        setViewMode,
    } = useUIStore()

    // Viewer state
    const [activeTab, setActiveTab] = useState<'finished' | 'pattern'>('pattern')
    const [showGrid, setShowGrid] = useState(false)
    const [showLabels, setShowLabels] = useState(true)
    const [showOutlines, setShowOutlines] = useState(true)
    const [editModeEnabled, setEditModeEnabled] = useState(false)
    const [editTool, setEditTool] = useState<'paint' | 'fabric'>('paint')
    const [selectedPaintValue, setSelectedPaintValue] = useState<string>('')
    const [hoveredRegionId, setHoveredRegionId] = useState<number | null>(null)
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)

    // Derived "Organic Detail" value (0..1)
    const organicDetail = useMemo(() =>
        1 - ((processingConfig.smoothingAmount + processingConfig.simplifyAmount) / 2),
        [processingConfig.smoothingAmount, processingConfig.simplifyAmount]
    )

    const handleOrganicDetailChange = useCallback((val: number) => {
        const inverse = 1 - val
        setProcessingConfig({
            smoothingAmount: inverse * 0.8,
            simplifyAmount: inverse * 0.5,
            minRegionSize: Math.round(inverse * 50) + 1
        })
    }, [setProcessingConfig])

    return (
        <div className="flex h-full w-full overflow-hidden bg-bg relative">
            {/* Sidebar: Build Controls */}
            <aside
                className={`flex-shrink-0 border-r border-border bg-surface flex flex-col overflow-hidden transition-all duration-300 ease-in-out ${isSidebarCollapsed ? 'w-0 border-none opacity-0' : 'w-[360px]'}`}
            >
                <div className="flex-1 overflow-y-auto">
                    <div className="p-6 space-y-8">
                        <header>
                            <h2 className="text-xl font-bold tracking-tight text-fg">Build Pattern</h2>
                            <p className="text-sm text-fg-muted">Fine-tune your embroidery blueprint.</p>
                        </header>

                        <section className="space-y-6">
                            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-fg-subtle">Display Mode</h3>
                            <SegmentedControl
                                value={activeTab}
                                onValueChange={(v) => setActiveTab(v as any)}
                                options={[
                                    { label: 'Finished Look', value: 'finished' },
                                    { label: 'Pattern Blueprint', value: 'pattern' },
                                ]}
                            />

                            {activeTab === 'pattern' && (
                                <div className="grid grid-cols-2 gap-3 pt-2">
                                    <Button
                                        variant={viewMode === 'Regions' ? 'primary' : 'secondary'}
                                        size="sm"
                                        className="h-9 text-[10px] uppercase font-bold tracking-wider"
                                        onClick={() => setViewMode('Regions')}
                                    >
                                        Regions
                                    </Button>
                                    <Button
                                        variant={viewMode === 'Grid' ? 'primary' : 'secondary'}
                                        size="sm"
                                        className="h-9 text-[10px] uppercase font-bold tracking-wider"
                                        onClick={() => setViewMode('Grid')}
                                    >
                                        Grid
                                    </Button>
                                </div>
                            )}
                        </section>

                        <section className="space-y-6">
                            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-fg-subtle">Blueprint Detail</h3>

                            <div className="space-y-5">
                                <Slider
                                    label="Number of Colors"
                                    min={PROCESSING.MIN_COLORS}
                                    max={PROCESSING.MAX_COLORS}
                                    step={1}
                                    value={processingConfig.colorCount}
                                    onChange={(v) => setProcessingConfig({ colorCount: v })}
                                    formatValue={(v) => v.toString()}
                                />

                                <Slider
                                    label="Organic Detail"
                                    min={0}
                                    max={1}
                                    step={0.01}
                                    value={organicDetail}
                                    onChange={handleOrganicDetailChange}
                                    formatValue={(v) => v < 0.3 ? 'Coarse' : v > 0.7 ? 'Fine' : 'Balanced'}
                                />

                                <div className="flex items-center justify-between pt-2">
                                    <span className="text-xs font-medium text-fg-muted">DMC Thread Map</span>
                                    <Toggle
                                        checked={processingConfig.useDmcPalette}
                                        onCheckedChange={(v) => setProcessingConfig({ useDmcPalette: v })}
                                    />
                                </div>
                            </div>
                        </section>

                        {activeTab === 'pattern' && (
                            <section className="space-y-6 border-t border-border/50 pt-6">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-fg-subtle">Visual Overlays</h3>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 text-[9px] uppercase font-bold"
                                        onClick={() => {
                                            setShowGrid(false)
                                            setShowLabels(true)
                                            setShowOutlines(true)
                                        }}
                                    >
                                        Reset
                                    </Button>
                                </div>

                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-fg-muted">Show Grid</span>
                                        <Toggle checked={showGrid} onCheckedChange={setShowGrid} />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-fg-muted">Show Labels</span>
                                        <Toggle checked={showLabels} onCheckedChange={setShowLabels} />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-fg-muted">Show Outlines</span>
                                        <Toggle checked={showOutlines} onCheckedChange={setShowOutlines} />
                                    </div>
                                </div>
                            </section>
                        )}

                        <section className="space-y-6 border-t border-border/50 pt-6 pb-4">
                            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-fg-subtle">Thread Manifest</h3>
                            <div className="bg-surface-2 rounded-xl border border-border/50 overflow-hidden">
                                <Legend />
                            </div>
                        </section>
                    </div>
                </div>

                {/* Bottom Actions */}
                <div className="p-6 border-t border-border bg-surface shadow-[0_-4px_12px_rgba(0,0,0,0.02)] space-y-3">
                    <div className="flex gap-3">
                        <Button
                            className="flex-1 h-12 text-sm font-bold tracking-tight"
                            variant="secondary"
                            onClick={() => setWorkflowStage('Select')}
                        >
                            Back
                        </Button>
                        <Button
                            className="flex-[2] h-12 text-sm font-bold tracking-tight shadow-xl"
                            variant="primary"
                            onClick={() => setWorkflowStage('Export')}
                        >
                            Confirm & Export
                        </Button>
                    </div>
                    {isProcessing && (
                        <div className="flex items-center justify-center gap-2 py-1 animate-in fade-in slide-in-from-bottom-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                            <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-fg-subtle">Processing...</span>
                        </div>
                    )}
                </div>
            </aside>

            {/* Main View: Large Pattern Preview in Studio Context */}
            <div className={`flex-1 bg-surface-2 relative flex items-center justify-center transition-all duration-300 ${isSidebarCollapsed ? 'p-0' : 'p-12'} overflow-hidden shadow-inner cursor-move`}>
                <StudioPreview fabricSetup={usePatternStore.getState().fabricSetup}>
                    <div className="absolute inset-0">
                        <PatternViewer
                            pattern={pattern}
                            activeTab={activeTab}
                            showGrid={showGrid}
                            showLabels={showLabels}
                            showOutlines={showOutlines}
                            editModeEnabled={editModeEnabled}
                            editTool={editTool}
                            selectedPaintValue={selectedPaintValue}
                            hoveredRegionId={hoveredRegionId}
                            onActiveTabChange={setActiveTab}
                            onShowGridChange={setShowGrid}
                            onShowLabelsChange={setShowLabels}
                            onShowOutlinesChange={setShowOutlines}
                            onEditModeEnabledChange={setEditModeEnabled}
                            onEditToolChange={setEditTool}
                            onSelectedPaintValueChange={setSelectedPaintValue}
                            onHoveredRegionIdChange={setHoveredRegionId}
                        />
                    </div>
                </StudioPreview>

                {/* Sidebar Collapse Toggle */}
                <button
                    onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                    className="absolute top-12 left-6 z-50 p-2.5 bg-white/80 backdrop-blur-md rounded-full border border-border/50 shadow-xl hover:bg-white transition-all hover:scale-110 group pointer-events-auto"
                    title={isSidebarCollapsed ? "Show Sidebar" : "Focus Mode"}
                >
                    <div className={`transition-transform duration-300 ${isSidebarCollapsed ? 'rotate-180' : 'rotate-0'}`}>
                        {isSidebarCollapsed ? '👉' : '👈'}
                    </div>
                </button>

                {/* Floating HUD for quick info */}
                <div className={`absolute bottom-12 right-12 px-4 py-2 bg-white/50 backdrop-blur-md rounded-lg border border-white/20 pointer-events-none transition-opacity duration-500 ${isSidebarCollapsed ? 'opacity-0' : 'opacity-100'}`}>
                    <span className="text-[10px] font-bold text-fg-subtle uppercase tracking-widest">
                        Assembly Mode: {activeTab === 'finished' ? 'Visualization' : 'Build'}
                    </span>
                </div>
            </div>
        </div>
    )
}
