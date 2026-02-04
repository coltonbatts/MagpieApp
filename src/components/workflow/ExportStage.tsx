import { useState } from 'react'
import { usePatternStore } from '@/store/pattern-store'
import { useUIStore } from '@/store/ui-store'
import { PatternViewer } from '@/viewer/PatternViewer'
import { ExportMenu } from '../ExportMenu'
import { Button, SegmentedControl } from '@/components/ui'

export function ExportStage() {
    const { pattern, compositionLocked } = usePatternStore()
    const { setWorkflowStage } = useUIStore()

    const [activeTab, setActiveTab] = useState<'finished' | 'pattern'>('finished')

    return (
        <div className="flex h-full w-full overflow-hidden bg-bg">
            {/* Sidebar: Export Controls */}
            <div className="w-[360px] flex-shrink-0 border-r border-border bg-surface flex flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto">
                    <div className="p-6 space-y-8">
                        <header>
                            <h2 className="text-xl font-bold tracking-tight text-fg">Export & Share</h2>
                            <p className="text-sm text-fg-muted">Finalize your project and download assets.</p>
                            {compositionLocked && (
                                <div className="mt-3 inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                                        Composition Locked
                                    </span>
                                </div>
                            )}
                        </header>

                        <section className="space-y-6">
                            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-fg-subtle">Preview Result</h3>
                            <SegmentedControl
                                value={activeTab}
                                onValueChange={(v) => setActiveTab(v as any)}
                                options={[
                                    { label: 'Finished Look', value: 'finished' },
                                    { label: 'Pattern Blueprint', value: 'pattern' },
                                ]}
                            />
                        </section>

                        <section className="space-y-6 pt-6 border-t border-border/50">
                            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-fg-subtle">Export Options</h3>
                            <div className="bg-surface-2 rounded-2xl border border-border/50 p-2">
                                <ExportMenu />
                            </div>
                        </section>

                        <section className="space-y-4 pt-6 border-t border-border/50">
                            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-fg-subtle">Project Info</h3>
                            <div className="space-y-3 px-1">
                                <div className="flex justify-between items-baseline">
                                    <span className="text-xs text-fg-muted leading-none">Dimensions</span>
                                    <span className="text-sm font-bold text-fg leading-none">{pattern?.width} x {pattern?.height} px</span>
                                </div>
                                <div className="flex justify-between items-baseline">
                                    <span className="text-xs text-fg-muted leading-none">Colors</span>
                                    <span className="text-sm font-bold text-fg leading-none">{pattern?.stitches.reduce((acc, s) => acc + (s.dmcCode !== 'Fabric' ? 1 : 0), 0).toLocaleString()} stitches</span>
                                </div>
                            </div>
                        </section>
                    </div>
                </div>

                {/* Bottom Actions */}
                <div className="p-6 border-t border-border bg-surface shadow-[0_-4px_12px_rgba(0,0,0,0.02)]">
                    <Button
                        className="w-full h-12 text-sm font-bold tracking-tight"
                        variant="secondary"
                        onClick={() => setWorkflowStage('Build', { source: 'cta' })}
                    >
                        Back to Build
                    </Button>
                </div>
            </div>

            {/* Main View: Large Pattern Preview */}
            <div className="flex-1 bg-surface-2 relative flex items-center justify-center p-8 overflow-hidden">
                <div className="w-full h-full rounded-2xl border border-border bg-white shadow-2xl overflow-hidden relative group">
                    <PatternViewer
                        pattern={pattern}
                        activeTab={activeTab}
                        showGrid={false}
                        showLabels={true}
                        showOutlines={true}
                        onActiveTabChange={setActiveTab}
                    />

                    {/* Floating HUD */}
                    <div className="absolute top-6 right-6 pointer-events-none">
                        <div className="px-4 py-2 bg-white/80 backdrop-blur-md rounded-full border border-border/50 shadow-lg pointer-events-auto">
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-fg-subtle">
                                Final Review
                            </span>
                        </div>
                    </div>
                    {compositionLocked && (
                        <div className="absolute top-6 left-6 pointer-events-none">
                            <div className="px-3 py-1.5 bg-emerald-50/90 backdrop-blur-md rounded-full border border-emerald-200 shadow-lg">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">
                                    Composition Locked
                                </span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
