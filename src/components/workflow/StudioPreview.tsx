import { ReactNode, memo } from 'react'
import type { FabricSetup } from '@/types'

interface StudioPreviewProps {
    fabricSetup: FabricSetup
    children?: ReactNode
}

export const StudioPreview = memo(function StudioPreview({ fabricSetup, children }: StudioPreviewProps) {
    // Safety checks
    if (!fabricSetup || !fabricSetup.color || !fabricSetup.hoop) {
        return null
    }

    const { r, g, b } = fabricSetup.color
    const { shape, widthMm, heightMm, marginMm } = fabricSetup.hoop

    // Validate numeric values
    if (typeof widthMm !== 'number' || typeof heightMm !== 'number' || typeof marginMm !== 'number' ||
        isNaN(widthMm) || isNaN(heightMm) || isNaN(marginMm) ||
        widthMm <= 0 || heightMm <= 0 || marginMm < 0) {
        return null
    }

    // Viewport mapping: 1mm = 2.5px for a nice zoom
    const scale = 2.5
    const hoopW = widthMm * scale
    const hoopH = heightMm * scale
    const marginW = Math.max(0, (widthMm - marginMm * 2) * scale)
    const marginH = Math.max(0, (heightMm - marginMm * 2) * scale)
    const hoopClipPath = shape === 'round'
        ? 'circle(50% at 50% 50%)'
        : shape === 'oval'
            ? 'ellipse(50% 50% at 50% 50%)'
            : 'inset(0 round 0)'

    return (
        <div className="relative w-full h-full flex items-center justify-center">
            {/* The Fabric Surface */}
            <div
                className="absolute inset-0 transition-colors duration-50 ease-out"
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

                {/* Global Lighting Shadow (Vignette) */}
                <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_150px_rgba(0,0,0,0.15)] mix-blend-multiply" />
                <div className="absolute inset-0 pointer-events-none bg-gradient-to-tr from-black/10 via-transparent to-white/5 mix-blend-overlay" />
            </div>

            {/* The Hoop Representation */}
            <div
                className="relative transition-all duration-75 ease-out"
                style={{
                    width: hoopW,
                    height: hoopH,
                    borderRadius: shape === 'round' ? '50%' : shape === 'oval' ? '9999px' : '0',
                    clipPath: hoopClipPath,
                    boxShadow: '0 0 0 1000px rgba(255, 255, 255, 0.35), 0 20px 60px rgba(0,0,0,0.15)',
                }}
            >
                {/* Image / Content Container (Clipped to Hoop) */}
                <div className="absolute inset-0 overflow-hidden" style={{ borderRadius: shape === 'round' ? '50%' : shape === 'oval' ? '9999px' : '0', clipPath: hoopClipPath }}>
                    {children}
                </div>

                {/* Hoop Frame (Physical Look - Wooden/Matte effect) */}
                <div
                    className="absolute inset-[-14px] border-[14px] border-[#e2e8f0] shadow-2xl transition-all duration-75 pointer-events-none"
                    style={{
                        borderRadius: shape === 'round' ? '50%' : shape === 'oval' ? '9999px' : '0',
                        boxShadow: 'inset 0 0 10px rgba(0,0,0,0.05), 0 10px 30px rgba(0,0,0,0.1)',
                    }}
                />

                {/* Safe Margin Indicator */}
                <div
                    className="absolute inset-0 flex items-center justify-center pointer-events-none"
                >
                    <div
                        className="border-2 border-dashed border-black/10 transition-all duration-75 ease-out flex items-center justify-center"
                        style={{
                            width: marginW,
                            height: marginH,
                            borderRadius: shape === 'round' ? '50%' : shape === 'oval' ? '9999px' : '0',
                            clipPath: hoopClipPath,
                        }}
                    >
                        <div className="absolute -top-8 px-3 py-1 bg-black/5 rounded-full backdrop-blur-md">
                            <span className="text-[10px] text-black/40 font-black uppercase tracking-[0.2em]">
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
})
