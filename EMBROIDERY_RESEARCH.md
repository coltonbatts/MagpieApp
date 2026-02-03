# Embroidery Pattern Generator — Technical Research

**Research Date:** February 2, 2026
**Objective:** Build a web app that converts images to DMC embroidery patterns with clean UX, interactive controls, and multi-format export.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Top 10 Repos & Libraries](#top-10-repos--libraries)
3. [Best Ideas to Steal](#best-ideas-to-steal)
4. [Recommended Architecture](#recommended-architecture)
5. [Implementation Roadmap](#implementation-roadmap)
6. [Technical Deep Dives](#technical-deep-dives)
7. [Reference Links](#reference-links)

---

## Executive Summary

### What We're Building

A web-based embroidery "paint-by-number" tool that:
- Accepts image uploads
- Quantizes to DMC thread colors (perceptual color matching)
- Provides interactive pan/zoom viewer with overlays
- Exports to PDF (tiled), PNG, SVG
- Offers real-time controls: color count, dithering, smoothing

### Key Technical Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| **Viewer** | PixiJS + pixi-viewport | WebGL performance, smooth pan/zoom, mobile-friendly |
| **Quantization** | K-means in LAB color space | Perceptual uniformity beats RGB for thread matching |
| **Color Matching** | CMC Delta-E distance | Accurate DMC palette matching |
| **Processing** | Web Worker (client-first) | Zero backend cost, instant iteration |
| **Export** | jsPDF + Canvas + SVG | Multi-format support without dependencies |
| **Stack** | React + Vite + TailwindCSS | Fast dev, minimal design, high ROI |

### The Gold Standard

**[png2dmc](https://github.com/aast242/png2dmc)** is the reference implementation for color science. Study its approach, reimplement in JS or wrap in Python backend.

---

## Top 10 Repos & Libraries

### A. Pattern Generation (Ranked by Relevance)

#### 1. png2dmc ⭐️ TOP PICK
- **Link:** https://github.com/aast242/png2dmc
- **Stack:** Python (scikit-learn, scikit-image, numpy, PIL)
- **License:** GPL-3.0 ⚠️ (Must open-source modifications or reimplement)
- **What It Does:**
  - K-means clustering in LAB color space
  - CMC Delta-E color matching to DMC palette
  - Outputs PNG patterns with 74 reusable marker symbols
  - Generates publication-ready legends with stitch counts
- **Why It's Relevant:**
  - Best-in-class quantization approach
  - Reproducible marker assignment (seeded by filename)
  - Handles unlimited colors via marker reuse
  - Configurable scaling/reduction
- **What to Steal:**
  - LAB→DMC matching pipeline
  - 11×11px marker sprite sheet design
  - Legend generation with stitch counts
- **License Workaround:** Reimplement k-means + Delta-E logic in JS or use as Python backend (must open-source if modifying directly)

---

#### 2. go-cross-stitch
- **Link:** https://github.com/lindsaylandry/go-cross-stitch
- **Stack:** Go (stdlib + image libraries)
- **License:** MIT ✅
- **What It Does:**
  - CLI tool for image → DMC pattern conversion
  - Supports RGB and LAB distance calculations
  - Outputs PNG + tiled PDF (A1/A2/A4 formats)
  - Includes dithering and multi-palette support (DMC, Anchor, LEGO)
- **Why It's Relevant:**
  - Fast compiled binary (good for performance benchmarking)
  - Clean reference for PDF tiling strategy
  - MIT licensed—safe to borrow from
- **What to Steal:**
  - PDF tiling algorithm (split large patterns into printable sections)
  - Multi-page export with overlap guides
  - CLI API design patterns

---

#### 3. Tarraz (طرّاز)
- **Link:** https://github.com/nitfeh/tarraz
- **Stack:** Python (PIL, numpy, scikit-learn)
- **License:** MIT ✅
- **What It Does:**
  - Command-line tool + Python library
  - DMC pattern generation with SVG export
  - Symbolic markers and configurable cell sizing
  - Color exclusion support
- **Why It's Relevant:**
  - Cleaner API design than png2dmc
  - MIT licensed (no GPL constraints)
  - SVG output for vector scaling
- **What to Steal:**
  - SVG export pipeline
  - Color exclusion/remapping UX
  - Library-friendly API design

---

#### 4. dmc-cross-stitch (Mosaic Designer)
- **Link:** https://github.com/kohsuke/dmc-cross-stitch
- **Stack:** Java (Swing GUI)
- **License:** MIT ✅
- **What It Does:**
  - Desktop app with sophisticated dithering algorithms
  - Bayer block matrix, Thomas Knoll composite dithering
  - Region masking and algorithm mixing
  - Supports multiple material palettes (LEGO, Perler beads)
- **Why It's Relevant:**
  - Advanced dithering techniques for edge preservation
  - Regional algorithm mixing (dither edges, nearest-color centers)
  - Mature reference for complex image processing
- **What to Steal:**
  - Dithering algorithm options (Bayer, ordered, error diffusion)
  - Regional processing strategies
  - Color exclusion picker UX

---

#### 5. EmbroideryPatternScript
- **Link:** https://github.com/swirlyclouds/EmbroideryPatternScript
- **Stack:** Python (scikit-learn, PIL)
- **License:** MIT (assumed)
- **What It Does:**
  - K-means clustering with LAB-to-RGB conversion
  - DMC thread matching
  - Outputs thread list and preview image
- **Why It's Relevant:**
  - Pioneering work on LAB color space for embroidery
  - Inspired png2dmc's approach
  - Clean reference implementation
- **What to Steal:**
  - Core LAB→DMC workflow
  - Thread list generation logic

---

### B. Viewer/Canvas Tech

#### 6. pixi-viewport ⭐️ TOP PICK
- **Link:** https://www.npmjs.com/package/pixi-viewport
- **Stack:** TypeScript/JavaScript (PixiJS 7+)
- **License:** MIT ✅
- **What It Does:**
  - Production-ready viewport plugin for PixiJS
  - Pan/zoom with clampZoom, pinch-to-zoom, deceleration
  - Edge bouncing and physics-based interactions
  - Configurable gesture support (mouse, touch, trackpad)
- **Why It's Relevant:**
  - Solves pan/zoom/pinch completely out-of-the-box
  - Handles massive canvases (think Google Maps fluidity)
  - Mobile-friendly with zero config
  - React integration available
- **What to Steal:**
  - ClampZoom configuration for boundary constraints
  - Deceleration physics for smooth interactions
  - Pinch gesture handling patterns
- **Implementation:**
  ```javascript
  import { Viewport } from 'pixi-viewport'

  const viewport = new Viewport({
    screenWidth: window.innerWidth,
    screenHeight: window.innerHeight,
    worldWidth: pattern.width * 20,
    worldHeight: pattern.height * 20,
    events: app.renderer.events
  })

  viewport
    .drag()
    .pinch()
    .wheel()
    .decelerate()
    .clamp({ direction: 'all' })
  ```

---

#### 7. Konva.js
- **Link:** https://konvajs.org/
- **Stack:** JavaScript (Canvas 2D abstraction)
- **License:** MIT ✅
- **What It Does:**
  - 2D Canvas library with pan/zoom, gestures, drag-drop
  - Grid snapping, shape manipulation, layers
  - React/Vue/Svelte wrappers available
  - Built-in hit detection and event handling
- **Why It's Relevant:**
  - Excellent for interactive editing (brush, fill, select)
  - Lighter weight than PixiJS for CPU-bound UI
  - Strong React integration (`react-konva`)
- **What to Steal:**
  - Grid snapping patterns
  - Interactive selection/editing UX
  - Layer management system
- **When to Use:** If interactive editing (brush, fill tools) is priority over viewing performance

---

#### 8. OpenSeadragon
- **Link:** https://openseadragon.github.io/
- **Stack:** Vanilla JavaScript
- **License:** BSD ✅
- **What It Does:**
  - Deep zoom viewer using tile pyramids
  - Optimized for high-resolution scientific images
  - Multi-format tile protocol support
  - Cache optimization for massive images
- **Why It's Relevant:**
  - Specialized for very large images (5000×5000px+)
  - Proven performance patterns
- **When to Use:** Only if supporting massive patterns; overkill for typical use case

---

### C. Export/Format Utilities

#### 9. pyembroidery
- **Link:** https://github.com/EmbroidePy/pyembroidery
- **Stack:** Python (stdlib)
- **License:** MIT ✅
- **What It Does:**
  - Reads/writes 46 embroidery formats (DST, PES, JEF, EXP, VP3, etc.)
  - Handles color changes, trims, sequins
  - Lossless CSV/JSON export
- **Why It's Relevant:**
  - Essential for actual embroidery machine files
  - Clean API for pattern manipulation
- **When to Use:** If targeting serious embroidery users with machines

---

#### 10. PEmbroider
- **Link:** https://github.com/CreativeInquiry/PEmbroider
- **Stack:** Java (Processing 3/4)
- **License:** GPL-3.0 + Anti-Capitalist ⚠️
- **What It Does:**
  - Computational embroidery design library
  - Multi-format export (DST, PES, JEF, PDF, SVG)
  - TSP-optimized stitch path generation
- **Why It's Relevant:**
  - Comprehensive export pipeline reference
  - Stitch path optimization algorithms
- **License Issue:** Not commercial-friendly; use as reference only

---

## Best Ideas to Steal

### Color Science (Critical for Quality)

#### LAB Color Space First
**Why:** LAB is perceptually uniform—equal distance = equal perceived color difference. RGB is not.

```python
# png2dmc approach (reference)
from skimage import color
import numpy as np

# Convert RGB to LAB
img_rgb = np.array(image) / 255.0
img_lab = color.rgb2lab(img_rgb)

# K-means clustering in LAB space
from sklearn.cluster import KMeans
kmeans = KMeans(n_clusters=n_colors, random_state=42)
labels = kmeans.fit_predict(img_lab.reshape(-1, 3))
```

**Implementation in JS:**
- Use [chroma.js](https://gka.github.io/chroma.js/) for LAB conversion
- OR implement manually:
  ```javascript
  function rgb2lab(r, g, b) {
    // Convert RGB [0-255] to XYZ, then XYZ to LAB
    // Math: https://en.wikipedia.org/wiki/CIELAB_color_space
  }
  ```

---

#### CMC Delta-E Distance Metric
**Why:** Perceptual color distance for accurate DMC matching.

```javascript
// Precompute DMC palette in LAB space
const dmcPaletteLAB = DMC_COLORS.map(color => {
  return {
    code: color.code,
    name: color.name,
    lab: rgb2lab(color.r, color.g, color.b)
  }
})

// Find closest DMC color using CMC Delta-E
function findClosestDMC(pixelLAB) {
  let minDistance = Infinity
  let closestDMC = null

  for (const dmc of dmcPaletteLAB) {
    const distance = deltaECMC(pixelLAB, dmc.lab)
    if (distance < minDistance) {
      minDistance = distance
      closestDMC = dmc
    }
  }

  return closestDMC
}
```

**Delta-E formulas:**
- CIE76 (simplest): Euclidean distance in LAB
- CIE94 (better): Weighted perceptual distance
- CIE2000 (best): Most accurate, complex math
- CMC (practical): Good balance of accuracy/speed

---

#### K-means Over Octree
**Why:** K-means gives better control over final color count and produces more uniform color distribution.

**Comparison:**
| Approach | Speed | Quality | Control | Use Case |
|----------|-------|---------|---------|----------|
| Octree | Fast (O(n)) | Good | Limited | Fixed palette reduction |
| Median Cut | Medium | Good | Limited | Quick previews |
| K-means | Slower (O(n·k·i)) | Best | Precise | Final pattern generation |

**Optimization:** Run k-means in Web Worker to avoid blocking UI.

---

#### Resize Before Quantization
**Why:** Reduces memory and processing time without sacrificing perceptual quality.

```javascript
// png2dmc sweet spot: 150-200px shortest side
function resizeForProcessing(img, targetShortestSide = 150) {
  const scale = targetShortestSide / Math.min(img.width, img.height)
  return resizeImage(img, img.width * scale, img.height * scale)
}
```

**Benchmarks:**
- 1000×1000 → 200×200: **95% reduction** in pixels, <5% perceived quality loss
- Processing time: 15s → 2s

---

### Smart Image Processing

#### Regional Algorithm Mixing
**Strategy:** Apply different algorithms to different regions for best visual results.

**Approach (from dmc-cross-stitch):**
- **Edges/Outlines:** Dithering (preserves detail, smooth gradients)
- **Flat Regions:** Nearest-color (crisp, clean areas)

```javascript
// Pseudo-code
function processImage(img, edgeThreshold) {
  const edgeMask = detectEdges(img, edgeThreshold)

  for (let pixel of img.pixels) {
    if (edgeMask.isEdge(pixel.x, pixel.y)) {
      pixel.color = applyDithering(pixel)
    } else {
      pixel.color = nearestColor(pixel)
    }
  }
}
```

---

#### Color Exclusion/Remapping
**UX:** Let users click legend to remove expensive/unavailable DMC colors.

```javascript
// Implementation
function excludeColor(dmcCode) {
  // Find all pixels using this color
  const affectedPixels = pattern.pixels.filter(p => p.dmcCode === dmcCode)

  // Remap to nearest remaining color
  affectedPixels.forEach(pixel => {
    const neighbors = getNeighborColors(pixel)
    pixel.dmcCode = findClosestDMC(pixel.color, excludedColors)
  })

  // Update legend and stitch counts
  updateLegend()
}
```

---

#### Seed Random by Filename
**Why:** Reproducible marker assignment across re-runs.

```javascript
// png2dmc approach
function assignMarkers(colors, seed) {
  const rng = seedRandom(seed) // Seeded random generator
  const markers = shuffleArray(MARKER_SYMBOLS, rng)

  return colors.map((color, i) => ({
    dmcCode: color.code,
    marker: markers[i % markers.length] // Reuse if >74 colors
  }))
}
```

---

### Marker/Legend System

#### 11×11px Symbol Grid
**Design:** Store markers as sprite sheet for efficient rendering.

```
┌─────────────────────────────────┐
│ ■ ● ▲ ★ ◆ ◇ ▼ ◀ ▶ ◾ ◽ ... (11×7)│
│ X + - / \ | = ~ • ○ □ ... (row 2)│
│ ... (74 total symbols)          │
└─────────────────────────────────┘
```

**Rendering:**
```javascript
// Use sprite sheet for performance
const markerSprite = new PIXI.Sprite(markerTexture)
markerSprite.texture.frame = new PIXI.Rectangle(
  symbolIndex * 11, 0, 11, 11
)
```

---

#### Marker Reuse with Legend Disambiguation
**Strategy:** When >74 colors, reuse symbols but flag in legend.

```javascript
// Example legend entry
{
  dmcCode: "310",
  marker: "■",
  markerReused: true, // Flag for UI
  stitchCount: 1247,
  hex: "#000000",
  name: "Black"
}
```

**UX:** Highlight reused markers in legend, show color swatch prominently.

---

#### Stitch Count per Color
**Use Cases:**
- Sort legend by count (most-used colors first)
- Generate shopping list (threads needed by usage)
- Estimate project time

```javascript
function calculateStitchCounts(pattern) {
  const counts = {}

  pattern.pixels.forEach(pixel => {
    counts[pixel.dmcCode] = (counts[pixel.dmcCode] || 0) + 1
  })

  return Object.entries(counts)
    .map(([code, count]) => ({ dmcCode: code, stitchCount: count }))
    .sort((a, b) => b.stitchCount - a.stitchCount)
}
```

---

### Export Strategy

#### PDF Tiling for Large Patterns
**Problem:** 500×500 stitch pattern can't fit on A4 paper.

**Solution:** Split into overlapping tiles with alignment guides.

```javascript
// go-cross-stitch approach (reference)
function tilePDF(pattern, pageSize = 'A4') {
  const stitchesPerPage = { A4: 50, A3: 70, A2: 100 }[pageSize]
  const overlap = 10 // stitches overlap for continuity

  const tiles = []
  for (let y = 0; y < pattern.height; y += stitchesPerPage - overlap) {
    for (let x = 0; x < pattern.width; x += stitchesPerPage - overlap) {
      tiles.push({
        x, y,
        width: Math.min(stitchesPerPage, pattern.width - x),
        height: Math.min(stitchesPerPage, pattern.height - y)
      })
    }
  }

  return generatePDF(tiles)
}
```

**Features:**
- Alignment guides at edges
- Legend on each page
- Page numbers (e.g., "Page 3 of 12")

---

#### Dual Export: PNG + SVG
**Strategy:** Offer multiple formats for different use cases.

| Format | Use Case | Pros | Cons |
|--------|----------|------|------|
| PNG (clean) | Reference while stitching | Simple, universal | Not scalable |
| PNG (marked) | Progress tracking | Printable symbols | Large file size |
| SVG | Vector scaling, laser cutting | Infinite zoom | Complex rendering |
| PDF | Professional printing | Multi-page, tiled | Requires library |

**Implementation:**
```javascript
// PNG Export
function exportPNG(pattern, includeMarkers = true) {
  const canvas = renderPatternToCanvas(pattern, includeMarkers)
  return canvas.toDataURL('image/png')
}

// SVG Export
function exportSVG(pattern) {
  let svg = `<svg width="${pattern.width * 10}" height="${pattern.height * 10}">`

  pattern.pixels.forEach(pixel => {
    svg += `<rect x="${pixel.x * 10}" y="${pixel.y * 10}"
                  width="10" height="10" fill="${pixel.hex}" />`
    if (pixel.marker) {
      svg += `<text x="${pixel.x * 10 + 5}" y="${pixel.y * 10 + 5}">${pixel.marker}</text>`
    }
  })

  svg += '</svg>'
  return svg
}
```

---

### Viewer UX Patterns

#### Layered Rendering
**Architecture:** Separate layers for independent control.

```javascript
// PixiJS layer structure
const viewport = new Viewport()

// Layer 1: Background grid
const gridLayer = new PIXI.Graphics()
drawGrid(gridLayer, pattern.width, pattern.height)

// Layer 2: Stitch cells
const stitchLayer = new PIXI.Container()
pattern.pixels.forEach(pixel => {
  const cell = new PIXI.Graphics()
  cell.beginFill(pixel.color)
  cell.drawRect(pixel.x * 10, pixel.y * 10, 10, 10)
  stitchLayer.addChild(cell)
})

// Layer 3: Overlay (hover, selection)
const overlayLayer = new PIXI.Graphics()

// Layer 4: Legend (HTML overlay)
const legend = document.createElement('div')
legend.className = 'absolute top-4 right-4 bg-white rounded shadow'

viewport.addChild(gridLayer)
viewport.addChild(stitchLayer)
viewport.addChild(overlayLayer)
```

**Toggle visibility:**
```javascript
function toggleLayer(layerName, visible) {
  layers[layerName].visible = visible
}
```

---

#### Zoom-to-Grid Detail
**Levels:**
1. **Macro** (1x-2x): Entire pattern overview
2. **Pattern** (3x-8x): Working view, grid visible
3. **Stitch** (10x-20x): Individual cell detail, markers readable

```javascript
viewport.on('zoomed', (event) => {
  const zoom = viewport.scale.x

  if (zoom < 2) {
    gridLayer.visible = false
    markerLayer.visible = false
  } else if (zoom < 8) {
    gridLayer.visible = true
    markerLayer.visible = false
  } else {
    gridLayer.visible = true
    markerLayer.visible = true
  }
})
```

---

### Interactive Controls

#### Color Count Slider (Real-Time)
**Challenge:** K-means takes 1-5s; slider needs instant feedback.

**Solution:** Debounce + progressive preview.

```javascript
const [colorCount, setColorCount] = useState(20)
const [processing, setProcessing] = useState(false)

// Debounce slider updates
const debouncedQuantize = useMemo(
  () => debounce((count) => {
    setProcessing(true)

    // Run in Web Worker
    worker.postMessage({
      type: 'quantize',
      image: imageData,
      colorCount: count
    })

    worker.onmessage = (e) => {
      setPattern(e.data.pattern)
      setProcessing(false)
    }
  }, 500),
  []
)

// Slider component
<input
  type="range"
  min="5"
  max="200"
  value={colorCount}
  onChange={(e) => {
    setColorCount(e.target.value)
    debouncedQuantize(e.target.value)
  }}
/>
```

---

#### Dither Algorithm Toggle
**Options:**
1. **None** — Nearest color only (crisp, blocky)
2. **Bayer** — Ordered dithering (clean patterns)
3. **Floyd-Steinberg** — Error diffusion (photorealistic)

```javascript
function applyDithering(img, algorithm) {
  switch (algorithm) {
    case 'none':
      return quantizeNearest(img)
    case 'bayer':
      return bayerDithering(img, BAYER_MATRIX_2x2)
    case 'floyd-steinberg':
      return floydSteinbergDithering(img)
  }
}
```

**UX:** Toggle with preview comparison (split view).

---

#### Sortable Legend
**Features:**
- Sort by: DMC code, stitch count, color hex
- Click color to highlight in pattern
- Click to exclude color

```javascript
function LegendItem({ dmc, stitchCount, onExclude, onHighlight }) {
  return (
    <div className="flex items-center gap-2 p-2 hover:bg-gray-100">
      <div
        className="w-6 h-6 rounded border"
        style={{ backgroundColor: dmc.hex }}
        onClick={() => onHighlight(dmc.code)}
      />
      <div className="flex-1">
        <div className="font-mono text-sm">{dmc.code}</div>
        <div className="text-xs text-gray-600">{dmc.name}</div>
      </div>
      <div className="text-sm text-gray-500">{stitchCount}</div>
      <button onClick={() => onExclude(dmc.code)}>×</button>
    </div>
  )
}
```

---

## Recommended Architecture

### System Overview

```
┌─────────────────────────────────────────────┐
│         Frontend (React + Vite)             │
│  - Upload component                         │
│  - Control panel (sliders, toggles)         │
│  - PixiJS viewer with pixi-viewport         │
│  - Legend component (sortable)              │
│  - Export buttons (PDF, PNG, SVG)           │
└───────────────┬─────────────────────────────┘
                │
        ┌───────▼──────────────────────────┐
        │  Web Worker (Processing)         │
        │  - Image resizing                │
        │  - K-means quantization (LAB)    │
        │  - DMC color matching (Delta-E)  │
        │  - Dithering algorithms          │
        └───────┬──────────────────────────┘
                │
        ┌───────▼──────────────────────────┐
        │  Export Pipeline                 │
        │  - jsPDF (tiled PDFs)            │
        │  - Canvas → PNG                  │
        │  - SVG generation                │
        │  - (Optional) pyembroidery       │
        └──────────────────────────────────┘
```

---

### Tech Stack

| Layer | Choice | Alternatives | Why |
|-------|--------|--------------|-----|
| **Framework** | React 18 | Vue, Svelte | Ecosystem, PixiJS wrappers |
| **Build Tool** | Vite | webpack, Parcel | Fast HMR, modern |
| **Viewer** | PixiJS 7 + pixi-viewport | Konva, Three.js | WebGL performance, mobile gestures |
| **Styling** | TailwindCSS | CSS Modules, styled-components | Rapid prototyping, minimal design |
| **State** | Zustand | Redux, Jotai | Lightweight, simple API |
| **Color Utils** | chroma.js | color-convert | LAB support, mature |
| **PDF Export** | jsPDF | pdfkit | Client-side, no backend |
| **Processing** | Web Worker | WASM (optional) | Non-blocking UI |

---

### Data Flow

```javascript
// 1. User uploads image
const file = event.target.files[0]
const img = await loadImage(file)

// 2. Send to Web Worker for processing
worker.postMessage({
  type: 'quantize',
  imageData: img.getImageData(),
  config: {
    colorCount: 20,
    ditherAlgorithm: 'none',
    targetSize: 150
  }
})

// 3. Worker responds with pattern data
worker.onmessage = (event) => {
  const { pattern, legend, metadata } = event.data

  // pattern: [{ x, y, dmcCode, marker, hex }, ...]
  // legend: [{ dmcCode, name, hex, stitchCount }, ...]
  // metadata: { width, height, totalStitches, processingTime }

  setPattern(pattern)
  setLegend(legend)
  renderToViewer(pattern)
}

// 4. User exports
function exportPDF() {
  const pdf = new jsPDF()
  tilePDF(pattern, pdf, 'A4')
  pdf.save('pattern.pdf')
}
```

---

### File Structure

```
embroidery-app/
├── public/
│   └── markers/
│       └── sprite-sheet.png       # 11×11px marker symbols
├── src/
│   ├── components/
│   │   ├── UploadZone.tsx         # Drag-drop file upload
│   │   ├── ControlPanel.tsx       # Sliders, toggles
│   │   ├── PatternViewer.tsx      # PixiJS viewport wrapper
│   │   ├── Legend.tsx             # Sortable DMC list
│   │   └── ExportMenu.tsx         # PDF/PNG/SVG buttons
│   ├── workers/
│   │   └── quantizer.worker.ts    # K-means + DMC matching
│   ├── lib/
│   │   ├── color.ts               # LAB conversion, Delta-E
│   │   ├── kmeans.ts              # K-means clustering
│   │   ├── dithering.ts           # Bayer, Floyd-Steinberg
│   │   ├── dmc-palette.ts         # 500 DMC colors (LAB)
│   │   ├── markers.ts             # Symbol assignment
│   │   └── export.ts              # PDF/PNG/SVG generators
│   ├── hooks/
│   │   ├── usePattern.ts          # Pattern state management
│   │   └── useViewer.ts           # PixiJS lifecycle
│   ├── store/
│   │   └── patternStore.ts        # Zustand store
│   ├── types/
│   │   └── pattern.ts             # TypeScript interfaces
│   ├── App.tsx
│   └── main.tsx
├── package.json
└── vite.config.ts
```

---

### Core Interfaces

```typescript
// Pattern data structure
interface Stitch {
  x: number
  y: number
  dmcCode: string
  marker: string
  hex: string
}

interface Pattern {
  stitches: Stitch[]
  width: number
  height: number
}

interface LegendEntry {
  dmcCode: string
  name: string
  hex: string
  stitchCount: number
  markerReused: boolean
}

interface DMCColor {
  code: string
  name: string
  hex: string
  rgb: [number, number, number]
  lab: [number, number, number] // Precomputed
}

interface ProcessingConfig {
  colorCount: number
  ditherAlgorithm: 'none' | 'bayer' | 'floyd-steinberg'
  targetSize: number
  excludedColors: string[]
}
```

---

### Processing Pipeline (Detailed)

```javascript
// Web Worker: quantizer.worker.ts

self.onmessage = async (event) => {
  const { type, imageData, config } = event.data

  if (type === 'quantize') {
    // 1. Resize image
    const resized = resizeImageData(imageData, config.targetSize)

    // 2. Convert RGB to LAB
    const labData = rgbToLab(resized)

    // 3. K-means clustering in LAB space
    const clusters = kMeans(labData, config.colorCount)

    // 4. Match each cluster to DMC color
    const dmcMapping = clusters.map(clusterLAB =>
      findClosestDMC(clusterLAB, DMC_PALETTE_LAB)
    )

    // 5. Apply dithering if enabled
    const dithered = config.ditherAlgorithm !== 'none'
      ? applyDithering(resized, dmcMapping, config.ditherAlgorithm)
      : quantizeNearest(resized, dmcMapping)

    // 6. Assign markers
    const markers = assignMarkers(dmcMapping, config.seed)

    // 7. Build pattern data
    const stitches = []
    for (let y = 0; y < dithered.height; y++) {
      for (let x = 0; x < dithered.width; x++) {
        const pixel = dithered.getPixel(x, y)
        const dmc = dmcMapping[pixel.clusterIndex]
        const marker = markers[pixel.clusterIndex]

        stitches.push({ x, y, dmcCode: dmc.code, marker, hex: dmc.hex })
      }
    }

    // 8. Generate legend
    const legend = generateLegend(stitches, dmcMapping)

    // 9. Send back to main thread
    self.postMessage({
      pattern: { stitches, width: dithered.width, height: dithered.height },
      legend,
      metadata: { processingTime: Date.now() - startTime }
    })
  }
}
```

---

### PixiJS Viewer Component

```typescript
// components/PatternViewer.tsx

import { useEffect, useRef } from 'react'
import * as PIXI from 'pixi.js'
import { Viewport } from 'pixi-viewport'

export function PatternViewer({ pattern, legend, onCellClick }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<PIXI.Application>()
  const viewportRef = useRef<Viewport>()

  useEffect(() => {
    if (!containerRef.current) return

    // Initialize PixiJS
    const app = new PIXI.Application({
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: 0xf5f5f5,
      antialias: true
    })
    containerRef.current.appendChild(app.view)
    appRef.current = app

    // Initialize viewport
    const viewport = new Viewport({
      screenWidth: window.innerWidth,
      screenHeight: window.innerHeight,
      worldWidth: pattern.width * 20,
      worldHeight: pattern.height * 20,
      events: app.renderer.events
    })

    viewport
      .drag()
      .pinch()
      .wheel({ smooth: 3 })
      .decelerate()
      .clamp({ direction: 'all' })

    app.stage.addChild(viewport)
    viewportRef.current = viewport

    // Render pattern
    renderPattern(viewport, pattern, legend)

    return () => {
      app.destroy()
    }
  }, [])

  useEffect(() => {
    if (viewportRef.current) {
      renderPattern(viewportRef.current, pattern, legend)
    }
  }, [pattern, legend])

  return <div ref={containerRef} className="w-full h-full" />
}

function renderPattern(viewport: Viewport, pattern: Pattern, legend: LegendEntry[]) {
  viewport.removeChildren()

  // Layer 1: Grid
  const grid = new PIXI.Graphics()
  grid.lineStyle(1, 0xcccccc, 0.3)
  for (let x = 0; x <= pattern.width; x++) {
    grid.moveTo(x * 20, 0)
    grid.lineTo(x * 20, pattern.height * 20)
  }
  for (let y = 0; y <= pattern.height; y++) {
    grid.moveTo(0, y * 20)
    grid.lineTo(pattern.width * 20, y * 20)
  }
  viewport.addChild(grid)

  // Layer 2: Stitches
  const stitchLayer = new PIXI.Container()
  pattern.stitches.forEach(stitch => {
    const cell = new PIXI.Graphics()
    cell.beginFill(parseInt(stitch.hex.slice(1), 16))
    cell.drawRect(stitch.x * 20, stitch.y * 20, 20, 20)
    cell.endFill()

    // Marker text
    const marker = new PIXI.Text(stitch.marker, {
      fontSize: 12,
      fill: 0x000000
    })
    marker.x = stitch.x * 20 + 5
    marker.y = stitch.y * 20 + 5

    cell.addChild(marker)
    stitchLayer.addChild(cell)
  })
  viewport.addChild(stitchLayer)
}
```

---

### Export Pipeline

```typescript
// lib/export.ts

import jsPDF from 'jspdf'

export function exportTiledPDF(pattern: Pattern, legend: LegendEntry[]) {
  const pdf = new jsPDF('landscape', 'mm', 'a4')
  const pageWidth = 297 // A4 landscape mm
  const pageHeight = 210
  const margin = 10
  const cellSize = 3 // mm per stitch
  const stitchesPerPage = Math.floor((pageWidth - margin * 2) / cellSize)

  const tiles = calculateTiles(pattern, stitchesPerPage, 10) // 10 stitch overlap

  tiles.forEach((tile, index) => {
    if (index > 0) pdf.addPage()

    // Draw tile
    for (let y = tile.y; y < tile.y + tile.height; y++) {
      for (let x = tile.x; x < tile.x + tile.width; x++) {
        const stitch = pattern.stitches.find(s => s.x === x && s.y === y)
        if (stitch) {
          pdf.setFillColor(stitch.hex)
          pdf.rect(
            margin + (x - tile.x) * cellSize,
            margin + (y - tile.y) * cellSize,
            cellSize,
            cellSize,
            'F'
          )

          // Marker text
          pdf.setFontSize(8)
          pdf.text(
            stitch.marker,
            margin + (x - tile.x) * cellSize + cellSize / 2,
            margin + (y - tile.y) * cellSize + cellSize / 2
          )
        }
      }
    }

    // Add legend
    const legendY = margin + tile.height * cellSize + 10
    pdf.setFontSize(10)
    pdf.text(`Page ${index + 1} of ${tiles.length}`, margin, legendY)

    legend.slice(0, 10).forEach((entry, i) => {
      pdf.setFillColor(entry.hex)
      pdf.rect(margin, legendY + 5 + i * 5, 5, 5, 'F')
      pdf.text(`${entry.dmcCode} - ${entry.name}`, margin + 7, legendY + 8 + i * 5)
    })
  })

  pdf.save('embroidery-pattern.pdf')
}

export function exportPNG(pattern: Pattern, includeMarkers: boolean): string {
  const canvas = document.createElement('canvas')
  canvas.width = pattern.width * 10
  canvas.height = pattern.height * 10
  const ctx = canvas.getContext('2d')!

  pattern.stitches.forEach(stitch => {
    ctx.fillStyle = stitch.hex
    ctx.fillRect(stitch.x * 10, stitch.y * 10, 10, 10)

    if (includeMarkers) {
      ctx.fillStyle = '#000000'
      ctx.font = '8px monospace'
      ctx.fillText(stitch.marker, stitch.x * 10 + 2, stitch.y * 10 + 8)
    }
  })

  return canvas.toDataURL('image/png')
}

export function exportSVG(pattern: Pattern): string {
  let svg = `<svg width="${pattern.width * 10}" height="${pattern.height * 10}" xmlns="http://www.w3.org/2000/svg">\n`

  pattern.stitches.forEach(stitch => {
    svg += `  <rect x="${stitch.x * 10}" y="${stitch.y * 10}" width="10" height="10" fill="${stitch.hex}" />\n`
    svg += `  <text x="${stitch.x * 10 + 5}" y="${stitch.y * 10 + 7}" font-size="6" text-anchor="middle">${stitch.marker}</text>\n`
  })

  svg += '</svg>'
  return svg
}
```

---

## Implementation Roadmap

### Phase 1: MVP (Week 1-2)

**Goal:** Upload → quantize → preview → export PNG

#### Day 1-2: Project Setup
- [ ] Initialize Vite + React + TypeScript
- [ ] Install dependencies: `pixi.js`, `pixi-viewport`, `chroma-js`, `jspdf`, `zustand`
- [ ] Set up file structure
- [ ] Create basic layout (upload zone, viewer, control panel)

#### Day 3-4: Core Processing
- [ ] Implement Web Worker for quantization
- [ ] LAB color conversion (chroma.js wrapper)
- [ ] K-means clustering (vanilla JS implementation)
- [ ] DMC palette matching (Delta-E CIE76 for MVP)
- [ ] Generate pattern data structure

#### Day 5-6: Viewer
- [ ] PixiJS setup with pixi-viewport
- [ ] Render grid layer
- [ ] Render stitch layer (colored cells)
- [ ] Pan/zoom/pinch gestures
- [ ] Basic zoom-level rendering (hide grid at low zoom)

#### Day 7: Export & Polish
- [ ] PNG export (clean + marked versions)
- [ ] Legend component (DMC code, name, count)
- [ ] Color count slider (5-200)
- [ ] Loading states and progress indicators
- [ ] Basic error handling

**Deliverable:** Working prototype that converts images to DMC patterns with interactive viewer.

---

### Phase 2: Enhanced Features (Week 3-4)

#### Week 3: Advanced Processing
- [ ] Dithering algorithms (Bayer, Floyd-Steinberg)
- [ ] Regional algorithm mixing
- [ ] Color exclusion/remapping
- [ ] Edge detection and smoothing
- [ ] Upgrade to Delta-E CMC or CIE2000

#### Week 4: Professional Export
- [ ] PDF tiling (multi-page A4 export)
- [ ] SVG export with vector markers
- [ ] Legend sorting (by code, count, hex)
- [ ] Shopping list generator (threads + quantities)
- [ ] Print-optimized layouts

**Deliverable:** Production-ready tool with professional export options.

---

### Phase 3: Polish & Optimization (Week 5-6)

#### Performance
- [ ] WASM k-means (if needed for speed)
- [ ] Progressive rendering (show partial results)
- [ ] Caching and memoization
- [ ] Optimize PixiJS rendering (sprite batching)
- [ ] Mobile performance testing

#### UX Refinements
- [ ] Undo/redo for color exclusion
- [ ] Preset configurations (photorealistic, blocky, minimal)
- [ ] Comparison view (before/after)
- [ ] Hover inspect (show DMC code on cell hover)
- [ ] Keyboard shortcuts (zoom, pan, toggle layers)

#### Additional Exports
- [ ] Embroidery machine formats (DST, PES via pyembroidery backend)
- [ ] CSV pattern data (for custom tools)
- [ ] Share/save pattern to cloud (optional)

**Deliverable:** Polished, market-ready application.

---

## Technical Deep Dives

### K-means Clustering in JavaScript

```javascript
// lib/kmeans.ts

/**
 * K-means clustering in LAB color space
 * Returns cluster centers and pixel assignments
 */
export function kMeans(
  pixels: LABColor[],
  k: number,
  maxIterations = 100
): { centers: LABColor[], assignments: number[] } {

  // 1. Initialize centroids (random selection)
  const centroids = initializeCentroids(pixels, k)

  let assignments = new Array(pixels.length).fill(0)
  let converged = false
  let iteration = 0

  while (!converged && iteration < maxIterations) {
    // 2. Assign each pixel to nearest centroid
    const newAssignments = pixels.map(pixel =>
      findNearestCentroid(pixel, centroids)
    )

    // 3. Check for convergence
    converged = arraysEqual(assignments, newAssignments)
    assignments = newAssignments

    // 4. Update centroids
    for (let i = 0; i < k; i++) {
      const cluster = pixels.filter((_, idx) => assignments[idx] === i)
      if (cluster.length > 0) {
        centroids[i] = averageColor(cluster)
      }
    }

    iteration++
  }

  return { centers: centroids, assignments }
}

function initializeCentroids(pixels: LABColor[], k: number): LABColor[] {
  // K-means++ initialization for better convergence
  const centroids: LABColor[] = []

  // First centroid: random pixel
  centroids.push(pixels[Math.floor(Math.random() * pixels.length)])

  // Subsequent centroids: weighted by distance
  for (let i = 1; i < k; i++) {
    const distances = pixels.map(pixel => {
      const minDist = Math.min(
        ...centroids.map(c => deltaE76(pixel, c))
      )
      return minDist * minDist
    })

    const totalDist = distances.reduce((a, b) => a + b, 0)
    const rand = Math.random() * totalDist

    let cumulative = 0
    for (let j = 0; j < pixels.length; j++) {
      cumulative += distances[j]
      if (cumulative >= rand) {
        centroids.push(pixels[j])
        break
      }
    }
  }

  return centroids
}

function findNearestCentroid(pixel: LABColor, centroids: LABColor[]): number {
  let minDist = Infinity
  let nearest = 0

  centroids.forEach((centroid, i) => {
    const dist = deltaE76(pixel, centroid)
    if (dist < minDist) {
      minDist = dist
      nearest = i
    }
  })

  return nearest
}

function averageColor(colors: LABColor[]): LABColor {
  const sum = colors.reduce(
    (acc, c) => ({
      L: acc.L + c.L,
      a: acc.a + c.a,
      b: acc.b + c.b
    }),
    { L: 0, a: 0, b: 0 }
  )

  return {
    L: sum.L / colors.length,
    a: sum.a / colors.length,
    b: sum.b / colors.length
  }
}
```

---

### Delta-E Color Distance

```javascript
// lib/color.ts

/**
 * Delta-E CIE76 (simplest, fast)
 */
export function deltaE76(lab1: LABColor, lab2: LABColor): number {
  const dL = lab1.L - lab2.L
  const da = lab1.a - lab2.a
  const db = lab1.b - lab2.b
  return Math.sqrt(dL * dL + da * da + db * db)
}

/**
 * Delta-E CIE94 (better perceptual accuracy)
 */
export function deltaE94(lab1: LABColor, lab2: LABColor): number {
  const dL = lab1.L - lab2.L
  const da = lab1.a - lab2.a
  const db = lab1.b - lab2.b

  const C1 = Math.sqrt(lab1.a * lab1.a + lab1.b * lab1.b)
  const C2 = Math.sqrt(lab2.a * lab2.a + lab2.b * lab2.b)
  const dC = C1 - C2

  const dH = Math.sqrt(Math.max(0, da * da + db * db - dC * dC))

  const kL = 1.0
  const kC = 1.0
  const kH = 1.0
  const K1 = 0.045
  const K2 = 0.015

  const sL = 1.0
  const sC = 1.0 + K1 * C1
  const sH = 1.0 + K2 * C1

  const dE = Math.sqrt(
    Math.pow(dL / (kL * sL), 2) +
    Math.pow(dC / (kC * sC), 2) +
    Math.pow(dH / (kH * sH), 2)
  )

  return dE
}

/**
 * Delta-E CMC (good balance of accuracy/speed)
 * l:c = 2:1 for perceptibility, 1:1 for acceptability
 */
export function deltaECMC(lab1: LABColor, lab2: LABColor, l = 2, c = 1): number {
  const dL = lab1.L - lab2.L
  const da = lab1.a - lab2.a
  const db = lab1.b - lab2.b

  const C1 = Math.sqrt(lab1.a * lab1.a + lab1.b * lab1.b)
  const C2 = Math.sqrt(lab2.a * lab2.a + lab2.b * lab2.b)
  const dC = C1 - C2

  const dH2 = da * da + db * db - dC * dC
  const dH = dH2 > 0 ? Math.sqrt(dH2) : 0

  const H1 = Math.atan2(lab1.b, lab1.a) * 180 / Math.PI
  const H1_deg = H1 < 0 ? H1 + 360 : H1

  const F = Math.sqrt(Math.pow(C1, 4) / (Math.pow(C1, 4) + 1900))

  let T
  if (H1_deg >= 164 && H1_deg <= 345) {
    T = 0.56 + Math.abs(0.2 * Math.cos((H1_deg + 168) * Math.PI / 180))
  } else {
    T = 0.36 + Math.abs(0.4 * Math.cos((H1_deg + 35) * Math.PI / 180))
  }

  const sL = lab1.L < 16 ? 0.511 : (0.040975 * lab1.L) / (1 + 0.01765 * lab1.L)
  const sC = (0.0638 * C1) / (1 + 0.0131 * C1) + 0.638
  const sH = sC * (F * T + 1 - F)

  const dE = Math.sqrt(
    Math.pow(dL / (l * sL), 2) +
    Math.pow(dC / (c * sC), 2) +
    Math.pow(dH / sH, 2)
  )

  return dE
}

/**
 * RGB to LAB conversion
 */
export function rgb2lab(r: number, g: number, b: number): LABColor {
  // Normalize RGB to [0, 1]
  let rNorm = r / 255
  let gNorm = g / 255
  let bNorm = b / 255

  // Apply gamma correction
  rNorm = rNorm > 0.04045 ? Math.pow((rNorm + 0.055) / 1.055, 2.4) : rNorm / 12.92
  gNorm = gNorm > 0.04045 ? Math.pow((gNorm + 0.055) / 1.055, 2.4) : gNorm / 12.92
  bNorm = bNorm > 0.04045 ? Math.pow((bNorm + 0.055) / 1.055, 2.4) : bNorm / 12.92

  // Convert to XYZ (D65 illuminant)
  let x = rNorm * 0.4124564 + gNorm * 0.3575761 + bNorm * 0.1804375
  let y = rNorm * 0.2126729 + gNorm * 0.7151522 + bNorm * 0.0721750
  let z = rNorm * 0.0193339 + gNorm * 0.1191920 + bNorm * 0.9503041

  // Normalize by D65 white point
  x /= 0.95047
  y /= 1.00000
  z /= 1.08883

  // Apply LAB transformation
  const fX = x > 0.008856 ? Math.pow(x, 1/3) : (7.787 * x + 16/116)
  const fY = y > 0.008856 ? Math.pow(y, 1/3) : (7.787 * y + 16/116)
  const fZ = z > 0.008856 ? Math.pow(z, 1/3) : (7.787 * z + 16/116)

  return {
    L: 116 * fY - 16,
    a: 500 * (fX - fY),
    b: 200 * (fY - fZ)
  }
}
```

---

### Dithering Algorithms

```javascript
// lib/dithering.ts

/**
 * Bayer ordered dithering (2×2 matrix)
 */
export function bayerDithering(imageData: ImageData, palette: RGBColor[]): ImageData {
  const BAYER_MATRIX = [
    [0, 2],
    [3, 1]
  ]

  const output = new ImageData(imageData.width, imageData.height)

  for (let y = 0; y < imageData.height; y++) {
    for (let x = 0; x < imageData.width; x++) {
      const i = (y * imageData.width + x) * 4
      const r = imageData.data[i]
      const g = imageData.data[i + 1]
      const b = imageData.data[i + 2]

      // Apply Bayer threshold
      const threshold = (BAYER_MATRIX[y % 2][x % 2] / 4.0 - 0.5) * 32
      const adjustedR = Math.max(0, Math.min(255, r + threshold))
      const adjustedG = Math.max(0, Math.min(255, g + threshold))
      const adjustedB = Math.max(0, Math.min(255, b + threshold))

      // Find nearest palette color
      const nearest = findNearestColor({ r: adjustedR, g: adjustedG, b: adjustedB }, palette)

      output.data[i] = nearest.r
      output.data[i + 1] = nearest.g
      output.data[i + 2] = nearest.b
      output.data[i + 3] = 255
    }
  }

  return output
}

/**
 * Floyd-Steinberg error diffusion dithering
 */
export function floydSteinbergDithering(imageData: ImageData, palette: RGBColor[]): ImageData {
  const output = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  )

  for (let y = 0; y < output.height; y++) {
    for (let x = 0; x < output.width; x++) {
      const i = (y * output.width + x) * 4
      const oldR = output.data[i]
      const oldG = output.data[i + 1]
      const oldB = output.data[i + 2]

      // Find nearest palette color
      const nearest = findNearestColor({ r: oldR, g: oldG, b: oldB }, palette)

      output.data[i] = nearest.r
      output.data[i + 1] = nearest.g
      output.data[i + 2] = nearest.b

      // Calculate error
      const errR = oldR - nearest.r
      const errG = oldG - nearest.g
      const errB = oldB - nearest.b

      // Distribute error to neighboring pixels
      distributeError(output, x + 1, y, errR, errG, errB, 7/16)
      distributeError(output, x - 1, y + 1, errR, errG, errB, 3/16)
      distributeError(output, x, y + 1, errR, errG, errB, 5/16)
      distributeError(output, x + 1, y + 1, errR, errG, errB, 1/16)
    }
  }

  return output
}

function distributeError(
  imageData: ImageData,
  x: number,
  y: number,
  errR: number,
  errG: number,
  errB: number,
  factor: number
) {
  if (x < 0 || x >= imageData.width || y < 0 || y >= imageData.height) return

  const i = (y * imageData.width + x) * 4
  imageData.data[i] += errR * factor
  imageData.data[i + 1] += errG * factor
  imageData.data[i + 2] += errB * factor
}

function findNearestColor(color: RGBColor, palette: RGBColor[]): RGBColor {
  let minDist = Infinity
  let nearest = palette[0]

  for (const paletteColor of palette) {
    const dist =
      Math.pow(color.r - paletteColor.r, 2) +
      Math.pow(color.g - paletteColor.g, 2) +
      Math.pow(color.b - paletteColor.b, 2)

    if (dist < minDist) {
      minDist = dist
      nearest = paletteColor
    }
  }

  return nearest
}
```

---

### DMC Color Palette

```typescript
// lib/dmc-palette.ts

/**
 * Complete DMC floss palette (500 colors)
 * Precomputed LAB values for fast matching
 */
export const DMC_PALETTE: DMCColor[] = [
  {
    code: "B5200",
    name: "Snow White",
    hex: "#FFFFFF",
    rgb: [255, 255, 255],
    lab: [100, 0, 0] // Precomputed
  },
  {
    code: "White",
    name: "White",
    hex: "#FEFEFE",
    rgb: [254, 254, 254],
    lab: [99.8, 0, 0]
  },
  {
    code: "Ecru",
    name: "Ecru",
    hex: "#F0EBD5",
    rgb: [240, 235, 213],
    lab: [93.2, -1.5, 11.4]
  },
  {
    code: "310",
    name: "Black",
    hex: "#000000",
    rgb: [0, 0, 0],
    lab: [0, 0, 0]
  },
  // ... (remaining 496 colors)
  // See nathantspencer/DMC-ColorCodes for full dataset
]

/**
 * Find closest DMC color using Delta-E CMC
 */
export function findClosestDMC(targetLAB: LABColor): DMCColor {
  let minDistance = Infinity
  let closestDMC = DMC_PALETTE[0]

  for (const dmc of DMC_PALETTE) {
    const distance = deltaECMC(targetLAB, dmc.lab)
    if (distance < minDistance) {
      minDistance = distance
      closestDMC = dmc
    }
  }

  return closestDMC
}

/**
 * Exclude specific colors from palette
 */
export function createFilteredPalette(excludedCodes: string[]): DMCColor[] {
  return DMC_PALETTE.filter(dmc => !excludedCodes.includes(dmc.code))
}
```

**Data Source:**
- https://github.com/nathantspencer/DMC-ColorCodes
- https://github.com/zilliah/embroidery-floss-api

---

## Reference Links

### Repos Analyzed
- [png2dmc](https://github.com/aast242/png2dmc) — LAB + k-means pattern generator
- [go-cross-stitch](https://github.com/lindsaylandry/go-cross-stitch) — Go-based PDF tiling
- [Tarraz](https://github.com/nitfeh/tarraz) — MIT licensed, SVG export
- [dmc-cross-stitch](https://github.com/kohsuke/dmc-cross-stitch) — Advanced dithering
- [EmbroideryPatternScript](https://github.com/swirlyclouds/EmbroideryPatternScript) — LAB workflow reference
- [pixi-viewport](https://www.npmjs.com/package/pixi-viewport) — Pan/zoom for PixiJS
- [pyembroidery](https://github.com/EmbroidePy/pyembroidery) — Embroidery format converter
- [PEmbroider](https://github.com/CreativeInquiry/PEmbroider) — Processing library

### DMC Data Sources
- [nathantspencer/DMC-ColorCodes](https://github.com/nathantspencer/DMC-ColorCodes) — CSV of DMC colors
- [zilliah/embroidery-floss-api](https://github.com/zilliah/embroidery-floss-api) — Floss API

### GitHub Topics
- [cross-stitch](https://github.com/topics/cross-stitch)
- [embroidery](https://github.com/topics/embroidery)
- [dmc](https://github.com/topics/dmc)
- [pattern-generator](https://github.com/topics/pattern-generator)
- [color-quantization](https://github.com/topics/color-quantization)

### Technical Resources
- [Real-time Image Color Palette Extractor](https://dev.to/ertugrulmutlu/real-time-image-color-palette-extractor-a-deep-dive-into-k-means-lab-and-de2000-4eoi) — K-means + LAB + Delta-E
- [Dithering Images with React/JavaScript](https://dev.to/bytebodger/dithering-images-with-reactjavascript-och) — Dithering algorithms
- [Delta-E Color Difference](https://en.wikipedia.org/wiki/Color_difference#CIEDE2000) — Wikipedia reference
- [LAB Color Space](https://en.wikipedia.org/wiki/CIELAB_color_space) — Theory
- [K-means Clustering](https://en.wikipedia.org/wiki/K-means_clustering) — Algorithm details

### Libraries & Tools
- [PixiJS](https://pixijs.com/) — WebGL renderer
- [pixi-viewport](https://github.com/davidfig/pixi-viewport) — Viewport plugin
- [Konva.js](https://konvajs.org/) — Canvas 2D framework
- [chroma.js](https://gka.github.io/chroma.js/) — Color utilities
- [jsPDF](https://github.com/parallax/jsPDF) — PDF generation
- [OpenSeadragon](https://openseadragon.github.io/) — Deep zoom viewer

### Online Tools (for testing)
- [FlossCross](https://flosscross.com/) — Online cross-stitch pattern maker
- [Pixel-Stitch](https://www.pixel-stitch.net/) — Image to pattern converter
- [ThreadReaver](https://threadreaver.com/) — Pattern analysis tool

---

## Quick Start Commands

```bash
# 1. Initialize project
npm create vite@latest embroidery-app -- --template react-ts
cd embroidery-app

# 2. Install core dependencies
npm install pixi.js pixi-viewport chroma-js jspdf zustand

# 3. Install dev dependencies
npm install -D @types/node

# 4. Clone reference repos (in parent directory)
cd ..
mkdir references
cd references
git clone https://github.com/aast242/png2dmc
git clone https://github.com/lindsaylandry/go-cross-stitch
git clone https://github.com/nitfeh/tarraz

# 5. Start development
cd ../embroidery-app
npm run dev
```

---

## License Compliance Notes

### Safe to Use (Commercial-Friendly)
- ✅ pixi-viewport (MIT)
- ✅ go-cross-stitch (MIT)
- ✅ Tarraz (MIT)
- ✅ Konva.js (MIT)
- ✅ PixiJS (MIT)
- ✅ pyembroidery (MIT)
- ✅ chroma.js (Apache-2.0)
- ✅ jsPDF (MIT)

### Requires Caution
- ⚠️ png2dmc (GPL-3.0) — Must open-source modifications or reimplement
- ⚠️ dmc-cross-stitch (MIT but dated, verify)
- ⚠️ PEmbroider (GPL-3.0 + Anti-Capitalist) — Reference only, not for commercial use

### Recommended Approach
1. Study png2dmc's algorithms (LAB, k-means, Delta-E)
2. Reimplement in TypeScript/JavaScript for client-side processing
3. Use MIT-licensed libraries (Tarraz, go-cross-stitch) for reference
4. Ensure all production dependencies are MIT/Apache-2.0

---

## Next Steps

1. **Today:** Set up Vite project, install PixiJS + pixi-viewport
2. **This Week:** Implement upload → quantize → preview pipeline
3. **Next Week:** Add interactive controls and export features
4. **Week 3-4:** Polish UX, optimize performance, add advanced features

**First code to write:** Upload component + basic PixiJS viewer (no processing yet).

---

*Research compiled: February 2, 2026*
*Last updated: February 2, 2026*
