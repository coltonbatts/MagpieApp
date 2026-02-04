import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { Button, Select, SegmentedControl, Slider } from '@/components/ui'
import { usePatternStore } from '@/store/pattern-store'
import { useUIStore } from '@/store/ui-store'
import { getPlatformAdapter } from '@/platform'
import { rgbToHsl, hslToRgb } from '@/lib/color-utils'
import {
  getRecentProjectsPruned,
  loadProjectFromPath,
  type RecentProjectEntry,
} from '@/project/persistence'
import { StudioPreview } from './StudioPreview'
import type { FabricSetup } from '@/types'

const FABRIC_TYPES = [
  { value: 'linen', label: 'Linen' },
  { value: 'cotton', label: 'Cotton' },
  { value: 'muslin', label: 'Muslin' },
  { value: 'aida', label: 'Aida' },
  { value: 'evenweave', label: 'Evenweave' },
] as const

export function FabricStage() {
  const { fabricSetup, setFabricSetup } = usePatternStore()
  const { setWorkflowStage } = useUIStore()
  const [recentProjects, setRecentProjects] = useState<RecentProjectEntry[]>([])
  const [isDesktop, setIsDesktop] = useState(false)
  const [isResuming, setIsResuming] = useState(false)

  // Local state for instant preview updates during dragging
  const [localFabricSetup, setLocalFabricSetup] = useState<FabricSetup>(fabricSetup)
  const isDraggingRef = useRef(false)
  
  // Sync local state when store updates (but not during drag)
  useEffect(() => {
    if (!isDraggingRef.current) {
      setLocalFabricSetup(fabricSetup)
    }
  }, [fabricSetup])

  // Local HSL for smooth color sliders
  const [hsl, setHsl] = useState(() =>
    rgbToHsl(fabricSetup.color.r, fabricSetup.color.g, fabricSetup.color.b)
  )

  useEffect(() => {
    let mounted = true
    getPlatformAdapter().then((platform) => {
      if (mounted) setIsDesktop(platform.isDesktop)
    })
    getRecentProjectsPruned().then((entries) => {
      if (mounted) setRecentProjects(entries)
    })
    return () => { mounted = false }
  }, [])

  // Instant preview update (local state only)
  const updateLocalFabricSetup = useCallback((updates: Partial<FabricSetup>) => {
    isDraggingRef.current = true
    setLocalFabricSetup((prev) => ({
      ...prev,
      ...updates,
      hoop: {
        ...prev.hoop,
        ...(updates.hoop ?? {}),
      },
    }))
  }, [])

  // Commit to store (called on mouse up)
  const commitFabricSetup = useCallback((updates: Partial<FabricSetup>) => {
    isDraggingRef.current = false
    setFabricSetup(updates)
  }, [setFabricSetup])
  
  // Commit all local state to store (called before stage transition)
  const handleConfirmCanvas = useCallback(() => {
    // Ensure we're not dragging
    isDraggingRef.current = false
    
    // Commit any pending HSL changes first
    const rgb = hslToRgb(hsl.h, hsl.s, hsl.l)
    const finalFabricSetup = {
      ...localFabricSetup,
      color: rgb,
    }
    
    // Commit all local state changes
    setFabricSetup(finalFabricSetup)
    
    // Small delay to ensure state is committed before transition
    requestAnimationFrame(() => {
      setWorkflowStage('Reference', { source: 'cta' })
    })
  }, [localFabricSetup, hsl, setFabricSetup, setWorkflowStage])

  const handleRgbChange = useCallback((hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    const newColor = { r, g, b }
    const newHsl = rgbToHsl(r, g, b)
    updateLocalFabricSetup({ color: newColor })
    commitFabricSetup({ color: newColor })
    setHsl(newHsl)
  }, [updateLocalFabricSetup, commitFabricSetup])
  
  // Sync HSL when fabricSetup.color changes externally
  useEffect(() => {
    const newHsl = rgbToHsl(fabricSetup.color.r, fabricSetup.color.g, fabricSetup.color.b)
    setHsl(newHsl)
  }, [fabricSetup.color.r, fabricSetup.color.g, fabricSetup.color.b])

  const handleHslChange = useCallback((changes: Partial<{ h: number, s: number, l: number }>) => {
    const nextHsl = { ...hsl, ...changes }
    setHsl(nextHsl)
    const rgb = hslToRgb(nextHsl.h, nextHsl.s, nextHsl.l)
    updateLocalFabricSetup({ color: rgb })
  }, [hsl, updateLocalFabricSetup])

  const handleHslCommit = useCallback((changes: Partial<{ h: number, s: number, l: number }>) => {
    const nextHsl = { ...hsl, ...changes }
    const rgb = hslToRgb(nextHsl.h, nextHsl.s, nextHsl.l)
    commitFabricSetup({ color: rgb })
  }, [hsl, commitFabricSetup])

  const handleProjectOpen = async (path: string) => {
    setIsResuming(true)
    try {
      await loadProjectFromPath(path)
    } finally {
      setIsResuming(false)
    }
  }

  const hexColor = useMemo(
    () => `#${localFabricSetup.color.r.toString(16).padStart(2, '0')}${localFabricSetup.color.g.toString(16).padStart(2, '0')}${localFabricSetup.color.b.toString(16).padStart(2, '0')}`,
    [localFabricSetup.color]
  )

  return (
    <div className="flex h-full w-full overflow-hidden bg-bg">
      {/* Sidebar: Studio Controls */}
      <div className="w-[340px] flex-shrink-0 border-r border-border bg-surface flex flex-col overflow-y-auto">
        <div className="p-6 space-y-8">
          <header>
            <h2 className="text-xl font-bold tracking-tight text-fg">Studio Setup</h2>
            <p className="text-sm text-fg-muted">Choose your canvas before processing.</p>
          </header>

          {/* Fabric section */}
          <section className="space-y-6">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-fg-subtle">Fabric Characteristics</h3>

            <div className="space-y-5">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-fg-muted">Material Type</span>
                <Select
                  value={fabricSetup.type}
                  onChange={(e) => setFabricSetup({ type: e.target.value as any })}
                >
                  {FABRIC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </Select>
              </label>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-fg-muted">Base Color</span>
                  <input
                    type="color"
                    value={hexColor}
                    onChange={(e) => handleRgbChange(e.target.value)}
                    className="h-7 w-12 cursor-pointer rounded border border-border bg-surface-2 p-0.5"
                  />
                </div>

                <div className="space-y-4 pt-1">
                  <HSLSlider 
                    label="Hue" 
                    min={0} 
                    max={360} 
                    value={hsl.h} 
                    onChange={(v) => handleHslChange({ h: v })} 
                    onChangeCommit={(v) => handleHslCommit({ h: v })} 
                  />
                  <HSLSlider 
                    label="Saturation" 
                    min={0} 
                    max={100} 
                    value={hsl.s} 
                    onChange={(v) => handleHslChange({ s: v })} 
                    onChangeCommit={(v) => handleHslCommit({ s: v })} 
                  />
                  <HSLSlider 
                    label="Lightness" 
                    min={0} 
                    max={100} 
                    value={hsl.l} 
                    onChange={(v) => handleHslChange({ l: v })} 
                    onChangeCommit={(v) => handleHslCommit({ l: v })} 
                  />
                </div>
              </div>

              <div className="space-y-5 pt-4 border-t border-border/50">
                <Slider
                  label="Texture Intensity"
                  min={0}
                  max={1}
                  step={0.01}
                  value={localFabricSetup.textureIntensity}
                  onChange={(v) => updateLocalFabricSetup({ textureIntensity: v })}
                  onChangeCommit={(v) => commitFabricSetup({ textureIntensity: v })}
                  formatValue={(v) => `${(v * 100).toFixed(0)}%`}
                />

                <Slider
                  label="Fabric Count (TPI)"
                  min={10}
                  max={40}
                  step={1}
                  value={localFabricSetup.count}
                  onChange={(v) => updateLocalFabricSetup({ count: v })}
                  onChangeCommit={(v) => commitFabricSetup({ count: v })}
                  formatValue={(v) => `${v} ct`}
                />
              </div>
            </div>
          </section>

          {/* Hoop section */}
          <section className="space-y-6">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-fg-subtle">Hoop & Composition</h3>

            <div className="space-y-5">
              <div className="space-y-1.5">
                <span className="text-xs font-medium text-fg-muted">Hoop Shape</span>
                <SegmentedControl
                  className="w-full"
                  value={fabricSetup.hoop.shape}
                  onValueChange={(v) => setFabricSetup({ hoop: { ...fabricSetup.hoop, shape: v as any } })}
                  options={[
                    { label: 'Round', value: 'round' },
                    { label: 'Square', value: 'square' },
                  ]}
                />
              </div>

              <Slider
                label="Diameter / Width (mm)"
                min={100}
                max={400}
                step={1}
                value={localFabricSetup.hoop.widthMm}
                onChange={(v) => updateLocalFabricSetup({ 
                  hoop: { ...localFabricSetup.hoop, widthMm: v, heightMm: v } 
                })}
                onChangeCommit={(v) => commitFabricSetup({ 
                  hoop: { ...localFabricSetup.hoop, widthMm: v, heightMm: v } 
                })}
                formatValue={(v) => `${v}mm`}
              />

              <Slider
                label="Safety Margin (mm)"
                min={5}
                max={40}
                step={1}
                value={localFabricSetup.hoop.marginMm}
                onChange={(v) => updateLocalFabricSetup({ 
                  hoop: { ...localFabricSetup.hoop, marginMm: v } 
                })}
                onChangeCommit={(v) => commitFabricSetup({ 
                  hoop: { ...localFabricSetup.hoop, marginMm: v } 
                })}
                formatValue={(v) => `${v}mm`}
              />
            </div>
          </section>

          <Button
            className="w-full h-12 text-base font-bold tracking-tight shadow-lg"
            variant="primary"
            onClick={handleConfirmCanvas}
          >
            Confirm Canvas
          </Button>

          {isDesktop && recentProjects.length > 0 && (
            <div className="pt-6 border-t border-border/50">
              <p className="text-[10px] uppercase tracking-widest text-fg-subtle font-bold mb-3">Recent Studio Projects</p>
              <div className="space-y-2">
                {recentProjects.slice(0, 3).map((entry: RecentProjectEntry) => (
                  <button
                    key={entry.path}
                    disabled={isResuming}
                    onClick={() => handleProjectOpen(entry.path)}
                    className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-surface-2 transition-all border border-transparent hover:border-border group"
                  >
                    <div className="text-xs font-bold text-fg truncate">{entry.name}</div>
                    <div className="text-[10px] text-fg-subtle truncate opacity-60 group-hover:opacity-100 transition-opacity">{entry.path}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main View: Visual Preview */}
      <div className="flex-1 bg-surface-2 relative flex items-center justify-center p-12 overflow-hidden shadow-inner">
        <StudioPreview fabricSetup={localFabricSetup} />
      </div>
    </div>
  )
}

function HSLSlider({ 
  label, 
  min, 
  max, 
  value, 
  onChange, 
  onChangeCommit 
}: { 
  label: string
  min: number
  max: number
  value: number
  onChange: (v: number) => void
  onChangeCommit?: (v: number) => void
}) {
  return (
    <Slider
      label={label}
      min={min}
      max={max}
      step={label === 'Hue' ? 1 : 0.5}
      value={value}
      onChange={onChange}
      onChangeCommit={onChangeCommit}
      formatValue={(v) => v.toFixed(0)}
    />
  )
}
