import { useEffect, useState } from 'react'
import { Button, Select, Input, SegmentedControl } from '@/components/ui'
import { usePatternStore } from '@/store/pattern-store'
import { useUIStore } from '@/store/ui-store'
import { getPlatformAdapter } from '@/platform'
import { rgbToHsl, hslToRgb } from '@/lib/color-utils'
import {
  getRecentProjectsPruned,
  loadProjectFromPath,
  type RecentProjectEntry,
} from '@/project/persistence'

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

  // Local HSL for smooth sliders
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

  const handleRgbChange = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    setFabricSetup({ color: { r, g, b } })
    setHsl(rgbToHsl(r, g, b))
  }

  const handleHslChange = (changes: Partial<{ h: number, s: number, l: number }>) => {
    const nextHsl = { ...hsl, ...changes }
    setHsl(nextHsl)
    const rgb = hslToRgb(nextHsl.h, nextHsl.s, nextHsl.l)
    setFabricSetup({ color: rgb })
  }

  const handleProjectOpen = async (path: string) => {
    setIsResuming(true)
    try {
      await loadProjectFromPath(path)
    } finally {
      setIsResuming(false)
    }
  }

  const hexColor = `#${fabricSetup.color.r.toString(16).padStart(2, '0')}${fabricSetup.color.g.toString(16).padStart(2, '0')}${fabricSetup.color.b.toString(16).padStart(2, '0')}`

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
                  <HSLSlider label="Hue" min={0} max={360} value={hsl.h} onChange={(v) => handleHslChange({ h: v })} />
                  <HSLSlider label="Saturation" min={0} max={100} value={hsl.s} onChange={(v) => handleHslChange({ s: v })} />
                  <HSLSlider label="Lightness" min={0} max={100} value={hsl.l} onChange={(v) => handleHslChange({ l: v })} />
                </div>
              </div>

              <div className="space-y-5 pt-4 border-t border-border/50">
                <div className="space-y-2.5">
                  <div className="flex justify-between">
                    <span className="text-xs font-medium text-fg-muted">Texture Intensity</span>
                    <span className="text-[10px] font-mono text-fg-subtle">{(fabricSetup.textureIntensity * 100).toFixed(0)}%</span>
                  </div>
                  <Input
                    variant="slider"
                    min={0} max={1} step={0.01}
                    value={fabricSetup.textureIntensity}
                    onChange={(e) => setFabricSetup({ textureIntensity: parseFloat(e.target.value) })}
                  />
                </div>

                <div className="space-y-2.5">
                  <div className="flex justify-between">
                    <span className="text-xs font-medium text-fg-muted">Fabric Count (TPI)</span>
                    <span className="text-[10px] font-mono text-fg-subtle">{fabricSetup.count} ct</span>
                  </div>
                  <Input
                    variant="slider"
                    min={10} max={40} step={1}
                    value={fabricSetup.count}
                    onChange={(e) => setFabricSetup({ count: parseInt(e.target.value) })}
                  />
                </div>
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

              <div className="space-y-2.5">
                <div className="flex justify-between">
                  <span className="text-xs font-medium text-fg-muted">Diameter / Width (mm)</span>
                  <span className="text-[10px] font-mono text-fg-subtle">{fabricSetup.hoop.widthMm}mm</span>
                </div>
                <Input
                  variant="slider"
                  min={100} max={300} step={10}
                  value={fabricSetup.hoop.widthMm}
                  onChange={(e) => {
                    const val = parseInt(e.target.value)
                    setFabricSetup({ hoop: { ...fabricSetup.hoop, widthMm: val, heightMm: val } })
                  }}
                />
              </div>

              <div className="space-y-2.5">
                <div className="flex justify-between">
                  <span className="text-xs font-medium text-fg-muted">Safety Margin (mm)</span>
                  <span className="text-[10px] font-mono text-fg-subtle">{fabricSetup.hoop.marginMm}mm</span>
                </div>
                <Input
                  variant="slider"
                  min={5} max={40} step={1}
                  value={fabricSetup.hoop.marginMm}
                  onChange={(e) => setFabricSetup({ hoop: { ...fabricSetup.hoop, marginMm: parseInt(e.target.value) } })}
                />
              </div>
            </div>
          </section>

          <Button
            className="w-full h-12 text-base font-bold tracking-tight shadow-lg"
            variant="primary"
            onClick={() => setWorkflowStage('Reference')}
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
        <FabricPreview fabricSetup={fabricSetup} />
      </div>
    </div>
  )
}

function HSLSlider({ label, min, max, value, onChange }: { label: string, min: number, max: number, value: number, onChange: (v: number) => void }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-[10px] font-bold text-fg-subtle uppercase tracking-wider">
        <span>{label}</span>
        <span className="font-mono">{value.toFixed(0)}</span>
      </div>
      <Input variant="slider" min={min} max={max} step={label === 'Hue' ? 1 : 0.5} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
    </div>
  )
}

function FabricPreview({ fabricSetup }: { fabricSetup: any }) {
  const { r, g, b } = fabricSetup.color
  const { shape, widthMm, heightMm, marginMm } = fabricSetup.hoop

  // Viewport mapping: 1mm = 2.5px for a nice zoom
  const scale = 2.5
  const hoopW = widthMm * scale
  const hoopH = heightMm * scale
  const marginW = (widthMm - marginMm * 2) * scale
  const marginH = (heightMm - marginMm * 2) * scale

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {/* The Fabric Surface */}
      <div
        className="absolute inset-0 transition-colors duration-500 ease-in-out"
        style={{ backgroundColor: `rgb(${r}, ${g}, ${b})` }}
      >
        {/* Fabric Texture Overlay (Noise/Grain) */}
        <div
          className="absolute inset-0 opacity-40 mix-blend-overlay pointer-events-none"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.6' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
            filter: `contrast(${1 + fabricSetup.textureIntensity * 0.5}) brightness(${1 - fabricSetup.textureIntensity * 0.1})`,
            backgroundSize: `${200 / (fabricSetup.count / 14)}px`
          }}
        />
        {/* Secondary texture for depth */}
        <div
          className="absolute inset-0 opacity-20 mix-blend-multiply pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/fabric-of-squares.png')]"
          style={{
            backgroundSize: `${400 / (fabricSetup.count / 14)}px`,
            filter: `blur(0.5px)`
          }}
        />
      </div>

      {/* The Hoop Representation */}
      <div
        className="relative transition-all duration-500 ease-standard"
        style={{
          width: hoopW,
          height: hoopH,
          borderRadius: shape === 'round' ? '50%' : '16px',
          boxShadow: '0 0 0 1000px rgba(255, 255, 255, 0.35), 0 20px 60px rgba(0,0,0,0.15)',
        }}
      >
        {/* Hoop Frame (Physical Look - Wooden/Matte effect) */}
        <div
          className="absolute inset-[-14px] border-[14px] border-[#e8dfd1] shadow-2xl transition-all duration-500"
          style={{
            borderRadius: shape === 'round' ? '50%' : '24px',
            borderColor: '#e2e8f0', // slate-200
            background: 'transparent',
            boxShadow: 'inset 0 0 10px rgba(0,0,0,0.05), 0 10px 30px rgba(0,0,0,0.1)',
          }}
        />

        {/* Safe Margin Indicator */}
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
        >
          <div
            className="border-2 border-dashed border-accent/20 transition-all duration-500 ease-standard flex items-center justify-center"
            style={{
              width: marginW,
              height: marginH,
              borderRadius: shape === 'round' ? '50%' : '8px',
            }}
          >
            <div className="absolute -top-8 px-3 py-1 bg-accent/10 rounded-full backdrop-blur-md">
              <span className="text-[10px] text-accent/60 font-black uppercase tracking-[0.2em]">
                Safe Stitch Zone
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Measurement HUD */}
      <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-white/90 backdrop-blur-xl px-4 py-2 rounded-2xl shadow-xl border border-border/50 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex flex-col items-center border-r border-border pr-4">
          <span className="text-[9px] font-bold text-fg-subtle uppercase tracking-widest">Hoop Size</span>
          <span className="text-sm font-bold text-fg">{widthMm}mm</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[9px] font-bold text-fg-subtle uppercase tracking-widest">Marginal Area</span>
          <span className="text-sm font-bold text-fg">{marginMm}mm</span>
        </div>
      </div>
    </div>
  )
}
