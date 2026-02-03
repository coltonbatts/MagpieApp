# MagpieApp — Codex Scaffolding Prompt

**Copy this entire prompt into Codex/Cursor to scaffold the project.**

---

## Context

You are scaffolding **MagpieApp**, an embroidery pattern generator that converts uploaded images into DMC thread color patterns with an interactive viewer and print-ready exports.

**Reference Documents in This Folder:**
- `EMBROIDERY_RESEARCH.md` — Technical research synthesis
- `ARCHITECTURE.md` (if created) — Project architecture decisions

**Key Architectural Decisions:**
- **Stack:** Vite + React + TypeScript + TailwindCSS + Zustand
- **Viewer:** PixiJS + pixi-viewport (WebGL rendering, smooth pan/zoom)
- **Processing:** Web Worker for k-means quantization in LAB color space
- **Color Matching:** Delta-E CIE76 to DMC palette (500 colors)
- **Exports:** PNG (clean + marked) + PDF (tiled A4 pages)
- **State:** Zustand (minimal, no Redux)

**Module Boundaries (STRICT):**
- `viewer/` — PixiJS rendering only, no image processing
- `processing/` — Quantization/k-means, outputs LAB clusters (NOT DMC codes)
- `palette/` — DMC color science, LAB↔RGB conversion, Delta-E matching
- `model/` — Pattern data structures, legend generation
- `exports/` — PDF/PNG/SVG file generation
- `ui/` — React components, user interactions

---

## Your Task: Day 1 Scaffolding

**Goal:** Set up project structure + working PixiJS viewer with a mock pattern.

### Step 1: Initialize Vite Project

Run these commands:

```bash
npm create vite@latest . -- --template react-ts
npm install
npm install pixi.js pixi-viewport zustand chroma-js jspdf
npm install -D tailwindcss postcss autoprefixer @types/node
npx tailwindcss init -p
```

### Step 2: Configure Tailwind

Update `tailwind.config.js`:

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

Update `src/index.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

### Step 3: Configure Vite for Workers

Update `vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  worker: {
    format: 'es',
  },
})
```

Update `tsconfig.json` to add path aliases:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

### Step 4: Create Folder Structure

Create this exact folder structure:

```
src/
├── components/
│   ├── ui/
│   ├── UploadZone.tsx
│   ├── ControlPanel.tsx
│   ├── Legend.tsx
│   ├── ExportMenu.tsx
│   └── Layout.tsx
├── viewer/
│   ├── layers/
│   ├── PatternViewer.tsx
│   ├── viewport-config.ts
│   └── types.ts
├── processing/
│   ├── quantizer.worker.ts
│   ├── kmeans.ts
│   ├── dithering.ts
│   ├── image-utils.ts
│   └── types.ts
├── palette/
│   ├── dmc-colors.ts
│   ├── color-conversion.ts
│   ├── color-distance.ts
│   ├── matcher.ts
│   └── types.ts
├── model/
│   ├── Pattern.ts
│   ├── Stitch.ts
│   ├── Legend.ts
│   └── types.ts
├── exports/
│   ├── pdf-export.ts
│   ├── png-export.ts
│   ├── svg-export.ts
│   └── types.ts
├── store/
│   ├── pattern-store.ts
│   └── ui-store.ts
├── hooks/
│   ├── usePattern.ts
│   ├── useViewer.ts
│   ├── useWorker.ts
│   └── useExport.ts
├── lib/
│   ├── file-utils.ts
│   ├── validation.ts
│   └── constants.ts
├── types/
│   └── index.ts
├── App.tsx
├── main.tsx
└── index.css
```

---

## File-by-File Instructions

### 1. `src/types/index.ts` — Core Type Definitions

```typescript
// Core type definitions used across the app

export interface RGBColor {
  r: number
  g: number
  b: number
}

export interface LABColor {
  L: number
  a: number
  b: number
}

export interface DMCColor {
  code: string
  name: string
  hex: string
  rgb: [number, number, number]
  lab: [number, number, number] // Precomputed
}

export interface Stitch {
  x: number
  y: number
  dmcCode: string
  marker: string
  hex: string
}

export interface LegendEntry {
  dmcCode: string
  name: string
  hex: string
  stitchCount: number
  markerReused: boolean
}

export interface ProcessingConfig {
  colorCount: number
  ditherMode: 'none' | 'bayer' | 'floyd-steinberg'
  targetSize: number // shortest side in pixels
}

export interface ViewerConfig {
  showGrid: boolean
  showMarkers: boolean
  zoomMin: number
  zoomMax: number
}

export interface ExportOptions {
  format: 'pdf' | 'png-clean' | 'png-marked' | 'svg'
  pageSize?: 'A4' | 'A3' | 'Letter'
  includeMarkers?: boolean
  includeGrid?: boolean
}
```

---

### 2. `src/model/Pattern.ts` — Pattern Data Model

```typescript
import type { Stitch, LegendEntry } from '@/types'

export class Pattern {
  stitches: Stitch[]
  width: number
  height: number

  constructor(stitches: Stitch[], width: number, height: number) {
    this.stitches = stitches
    this.width = width
    this.height = height
  }

  getLegend(): LegendEntry[] {
    const counts = new Map<string, number>()
    const dmcInfo = new Map<string, { name: string; hex: string }>()

    this.stitches.forEach((stitch) => {
      counts.set(stitch.dmcCode, (counts.get(stitch.dmcCode) || 0) + 1)
      if (!dmcInfo.has(stitch.dmcCode)) {
        dmcInfo.set(stitch.dmcCode, {
          name: stitch.dmcCode, // TODO: lookup actual DMC name
          hex: stitch.hex,
        })
      }
    })

    return Array.from(counts.entries())
      .map(([dmcCode, stitchCount]) => ({
        dmcCode,
        name: dmcInfo.get(dmcCode)!.name,
        hex: dmcInfo.get(dmcCode)!.hex,
        stitchCount,
        markerReused: false, // TODO: detect marker reuse
      }))
      .sort((a, b) => b.stitchCount - a.stitchCount)
  }

  getStitchCount(dmcCode: string): number {
    return this.stitches.filter((s) => s.dmcCode === dmcCode).length
  }

  // Generate mock pattern for testing
  static createMock(size: number = 10): Pattern {
    const stitches: Stitch[] = []
    const colors = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF']
    const markers = ['■', '●', '▲', '★', '◆']

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const colorIndex = Math.floor(Math.random() * colors.length)
        stitches.push({
          x,
          y,
          dmcCode: `DMC-${colorIndex}`,
          marker: markers[colorIndex],
          hex: colors[colorIndex],
        })
      }
    }

    return new Pattern(stitches, size, size)
  }
}
```

---

### 3. `src/viewer/viewport-config.ts` — Pixi Viewport Setup

```typescript
import { Viewport } from 'pixi-viewport'
import type { Application } from 'pixi.js'

export function createViewport(
  app: Application,
  worldWidth: number,
  worldHeight: number
): Viewport {
  const viewport = new Viewport({
    screenWidth: window.innerWidth,
    screenHeight: window.innerHeight,
    worldWidth,
    worldHeight,
    events: app.renderer.events,
  })

  viewport
    .drag()
    .pinch()
    .wheel({ smooth: 3 })
    .decelerate({ friction: 0.9 })
    .clamp({ direction: 'all' })
    .clampZoom({
      minScale: 0.1,
      maxScale: 10,
    })

  return viewport
}
```

---

### 4. `src/viewer/PatternViewer.tsx` — Main Viewer Component

```typescript
import { useEffect, useRef } from 'react'
import * as PIXI from 'pixi.js'
import { createViewport } from './viewport-config'
import { Pattern } from '@/model/Pattern'

interface PatternViewerProps {
  pattern: Pattern | null
  showGrid?: boolean
}

export function PatternViewer({ pattern, showGrid = true }: PatternViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<PIXI.Application>()
  const viewportRef = useRef<any>()

  useEffect(() => {
    if (!containerRef.current) return

    // Initialize PixiJS Application
    const app = new PIXI.Application()

    app.init({
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: 0xf5f5f5,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
    }).then(() => {
      if (!containerRef.current) return

      containerRef.current.appendChild(app.canvas)
      appRef.current = app

      // Initialize viewport
      if (pattern) {
        const viewport = createViewport(app, pattern.width * 20, pattern.height * 20)
        app.stage.addChild(viewport)
        viewportRef.current = viewport

        renderPattern(viewport, pattern, showGrid)
      }
    })

    // Cleanup
    return () => {
      app.destroy(true, { children: true, texture: true })
    }
  }, [])

  useEffect(() => {
    if (viewportRef.current && pattern) {
      viewportRef.current.removeChildren()
      renderPattern(viewportRef.current, pattern, showGrid)
    }
  }, [pattern, showGrid])

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ touchAction: 'none' }}
    />
  )
}

function renderPattern(viewport: any, pattern: Pattern, showGrid: boolean) {
  const cellSize = 20

  // Layer 1: Grid
  if (showGrid) {
    const grid = new PIXI.Graphics()
    grid.setStrokeStyle({ width: 1, color: 0xcccccc, alpha: 0.3 })

    for (let x = 0; x <= pattern.width; x++) {
      grid.moveTo(x * cellSize, 0)
      grid.lineTo(x * cellSize, pattern.height * cellSize)
      grid.stroke()
    }

    for (let y = 0; y <= pattern.height; y++) {
      grid.moveTo(0, y * cellSize)
      grid.lineTo(pattern.width * cellSize, y * cellSize)
      grid.stroke()
    }

    viewport.addChild(grid)
  }

  // Layer 2: Stitches
  const stitchLayer = new PIXI.Container()

  pattern.stitches.forEach((stitch) => {
    const cell = new PIXI.Graphics()
    const color = parseInt(stitch.hex.slice(1), 16)

    cell.rect(stitch.x * cellSize, stitch.y * cellSize, cellSize, cellSize)
    cell.fill(color)

    stitchLayer.addChild(cell)
  })

  viewport.addChild(stitchLayer)
}
```

---

### 5. `src/store/pattern-store.ts` — Zustand State Management

```typescript
import { create } from 'zustand'
import { Pattern } from '@/model/Pattern'
import type { ProcessingConfig } from '@/types'

interface PatternState {
  // Image state
  originalImage: ImageBitmap | null
  normalizedImage: ImageData | null

  // Pattern state
  pattern: Pattern | null
  processingConfig: ProcessingConfig

  // UI state
  isProcessing: boolean
  error: string | null

  // Actions
  setOriginalImage: (image: ImageBitmap) => void
  setNormalizedImage: (image: ImageData) => void
  setPattern: (pattern: Pattern) => void
  setProcessingConfig: (config: Partial<ProcessingConfig>) => void
  setIsProcessing: (isProcessing: boolean) => void
  setError: (error: string | null) => void
  reset: () => void
}

export const usePatternStore = create<PatternState>((set) => ({
  // Initial state
  originalImage: null,
  normalizedImage: null,
  pattern: null,
  processingConfig: {
    colorCount: 20,
    ditherMode: 'none',
    targetSize: 150,
  },
  isProcessing: false,
  error: null,

  // Actions
  setOriginalImage: (image) => set({ originalImage: image }),
  setNormalizedImage: (image) => set({ normalizedImage: image }),
  setPattern: (pattern) => set({ pattern }),
  setProcessingConfig: (config) =>
    set((state) => ({
      processingConfig: { ...state.processingConfig, ...config },
    })),
  setIsProcessing: (isProcessing) => set({ isProcessing }),
  setError: (error) => set({ error }),
  reset: () =>
    set({
      originalImage: null,
      normalizedImage: null,
      pattern: null,
      isProcessing: false,
      error: null,
    }),
}))
```

---

### 6. `src/lib/constants.ts` — App Constants

```typescript
export const APP_NAME = 'MagpieApp'

export const FILE_UPLOAD = {
  MAX_SIZE_MB: 10,
  ACCEPTED_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
  ACCEPTED_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.webp'],
} as const

export const PROCESSING = {
  MIN_COLORS: 1,
  MAX_COLORS: 200,
  DEFAULT_COLORS: 20,
  DEFAULT_TARGET_SIZE: 150,
  MIN_TARGET_SIZE: 50,
  MAX_TARGET_SIZE: 500,
} as const

export const VIEWER = {
  CELL_SIZE: 20,
  MIN_ZOOM: 0.1,
  MAX_ZOOM: 10,
  DEFAULT_ZOOM: 1,
} as const

export const EXPORT = {
  PDF_PAGE_SIZES: {
    A4: { width: 210, height: 297 },
    A3: { width: 297, height: 420 },
    Letter: { width: 216, height: 279 },
  },
  DEFAULT_PAGE_SIZE: 'A4' as const,
} as const
```

---

### 7. `src/components/Layout.tsx` — App Layout

```typescript
import { ReactNode } from 'react'

interface LayoutProps {
  viewer: ReactNode
  controls: ReactNode
  legend: ReactNode
}

export function Layout({ viewer, controls, legend }: LayoutProps) {
  return (
    <div className="flex h-screen w-screen bg-gray-50">
      {/* Left Panel: Controls */}
      <div className="w-80 bg-white border-r border-gray-200 overflow-y-auto">
        <div className="p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">MagpieApp</h1>
          {controls}
        </div>
      </div>

      {/* Center: Viewer */}
      <div className="flex-1 relative">{viewer}</div>

      {/* Right Panel: Legend */}
      <div className="w-80 bg-white border-l border-gray-200 overflow-y-auto">
        <div className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Legend</h2>
          {legend}
        </div>
      </div>
    </div>
  )
}
```

---

### 8. `src/components/ControlPanel.tsx` — Control Panel Stub

```typescript
import { usePatternStore } from '@/store/pattern-store'
import { PROCESSING } from '@/lib/constants'

export function ControlPanel() {
  const { processingConfig, setProcessingConfig } = usePatternStore()

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Number of Colors: {processingConfig.colorCount}
        </label>
        <input
          type="range"
          min={PROCESSING.MIN_COLORS}
          max={PROCESSING.MAX_COLORS}
          value={processingConfig.colorCount}
          onChange={(e) =>
            setProcessingConfig({ colorCount: parseInt(e.target.value) })
          }
          className="w-full"
        />
      </div>

      {/* TODO: Add more controls */}
    </div>
  )
}
```

---

### 9. `src/components/Legend.tsx` — Legend Stub

```typescript
import { usePatternStore } from '@/store/pattern-store'

export function Legend() {
  const { pattern } = usePatternStore()

  if (!pattern) {
    return <p className="text-sm text-gray-500">Upload an image to see legend</p>
  }

  const legend = pattern.getLegend()

  return (
    <div className="space-y-2">
      {legend.map((entry) => (
        <div
          key={entry.dmcCode}
          className="flex items-center gap-2 p-2 rounded hover:bg-gray-50"
        >
          <div
            className="w-6 h-6 rounded border border-gray-300"
            style={{ backgroundColor: entry.hex }}
          />
          <div className="flex-1">
            <div className="text-sm font-mono">{entry.dmcCode}</div>
            <div className="text-xs text-gray-500">{entry.name}</div>
          </div>
          <div className="text-sm text-gray-600">{entry.stitchCount}</div>
        </div>
      ))}
    </div>
  )
}
```

---

### 10. `src/App.tsx` — Main App Component

```typescript
import { Layout } from './components/Layout'
import { PatternViewer } from './viewer/PatternViewer'
import { ControlPanel } from './components/ControlPanel'
import { Legend } from './components/Legend'
import { usePatternStore } from './store/pattern-store'
import { Pattern } from './model/Pattern'
import { useEffect } from 'react'

export default function App() {
  const { pattern, setPattern } = usePatternStore()

  // Day 1: Load mock pattern
  useEffect(() => {
    const mockPattern = Pattern.createMock(20)
    setPattern(mockPattern)
  }, [setPattern])

  return (
    <Layout
      viewer={<PatternViewer pattern={pattern} showGrid={true} />}
      controls={<ControlPanel />}
      legend={<Legend />}
    />
  )
}
```

---

## Critical Instructions for Codex

### DO:
✅ Create ALL files in the folder structure above
✅ Use TypeScript strict mode
✅ Follow module boundaries (viewer only renders, palette only does color science)
✅ Keep functions pure where possible
✅ Use Zustand for state (no Redux)
✅ Use TailwindCSS for styling
✅ Add TODO comments for unimplemented features
✅ Make the mock pattern visible and interactive on Day 1

### DON'T:
❌ Don't add Redux or MobX (use Zustand)
❌ Don't add CSS-in-JS libraries (use Tailwind)
❌ Don't add unnecessary dependencies
❌ Don't implement full quantization on Day 1 (mock pattern only)
❌ Don't mix concerns (viewer should never run k-means)
❌ Don't copy GPL-licensed code (reimplement concepts)

---

## Expected Outcome

After running this scaffold:
1. `npm run dev` should start without errors
2. Browser should show:
   - Left panel with color count slider
   - Center with 20×20 colored grid (mock pattern)
   - Right panel with legend showing 5 random colors
3. Pan/zoom should work smoothly with trackpad
4. Grid should be visible
5. No console errors

---

## Verification Checklist

After scaffolding, verify:
- [ ] Project builds without TypeScript errors
- [ ] Dev server starts on http://localhost:5173
- [ ] Mock pattern renders in PixiJS canvas
- [ ] Pan/zoom works (drag, pinch, wheel)
- [ ] Legend shows DMC codes and stitch counts
- [ ] Color count slider moves (doesn't do anything yet)
- [ ] Layout is responsive
- [ ] No console errors or warnings

---

## Next Steps (After Day 1)

Once this scaffold is complete:
- **Day 2:** Add `UploadZone.tsx` for image upload
- **Day 3:** Implement `quantizer.worker.ts` for real processing
- **Day 4:** Add DMC color matching in `palette/`
- **Day 5:** Implement exports in `exports/`

---

## Troubleshooting

**If PixiJS doesn't render:**
- Check that `pixi.js` version is 8.x or higher
- Verify `app.init()` completes before accessing canvas
- Check browser console for WebGL errors

**If viewport doesn't respond:**
- Verify `touchAction: 'none'` is set on container
- Check that `app.renderer.events` is passed to Viewport
- Test with mouse wheel (easier than trackpad debugging)

**If TypeScript errors:**
- Run `npm install @types/node`
- Check `tsconfig.json` has correct paths config
- Verify all imports use `@/` alias

---

## Ready to Build

This scaffold gives you:
- ✅ Complete project structure
- ✅ Working PixiJS viewer with mock data
- ✅ State management setup
- ✅ Type definitions
- ✅ UI layout
- ✅ Module boundaries enforced

**Start with:** `npm run dev` and verify everything works.
**Then move to Day 2:** Image upload and normalization.
