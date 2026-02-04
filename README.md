# MagpieApp

**The Artisan's Blueprint for Modern Embroidery.**

MagpieApp is a professional-grade embroidery design suite built for precision and performance. It transforms images into high-fidelity "Artisan Blueprints"—technical patterns designed for modern hand-embroidery.

---

## 🏗️ The Assembly Line

MagpieApp follows a structured, 5-stage workflow designed for clarity and creative control:

1. **Fabric Stage**
   Define your canvas. Select your hoop size and fabric type to ground your project in physical dimensions.

2. **Reference Stage**
   Direct manipulation interface. Click and drag to position your reference image within the hoop. Precision alignment for the foundation of your work.

3. **Select Stage (The Mask)**
   Artist-friendly masking. Use the intelligent **Magic Wand** tool to select exactly which areas of your image should be stitched. Separate the subject from the background with surgical precision.

4. **Build Stage**
   High-performance pattern generation. Watch as your image is quantized into DMC thread colors and organized into interactive regions.
   - **Region-based Rendering**: A "paint-by-numbers" style interface for visual clarity.
   - **Dynamic Legend**: Interact with thread palettes to highlight specific regions.

5. **Export Stage**
   Distribute your masterpiece. Generate professional **Artisan Blueprint PDFs** and high-fidelity SVGs. Includes a Swiss-modernist style Thread Manifest for project management.

---

## ⚡ Technical Excellence

MagpieApp is built on a high-performance native foundation:

- **Tauri 2 + Rust Core**: A robust desktop shell with a native Rust backend for heavy lifting.
- **Native Processing Pipeline**: Pattern generation is handled by specialized Rust modules (`embroidery.rs`, `regions.rs`) leveraging `rayon` for massive parallelism.
- **Color Science**: Uses `CIEDE2000` color difference formulas for industry-leading DMC thread matching.
- **Pixi.js Renderer**: WebGL-accelerated rendering capable of handling complex vector regions and high-count stitch grids with fluid performance.
- **Editorial Modernism**: A UI aesthetic inspired by Swiss design—clean, authoritative, and minimalist.

---

## 🚀 Getting Started

### Prerequisites

- **Node.js 18+**
- **Rust Toolchain** (for Desktop development)
- **Tauri Dependencies** (see [Tauri Setup Guide](https://tauri.app/v2/guides/getting-started/prerequisites/))

### Installation

```bash
npm install
```

### Development

#### Native Desktop (Recommended)

The desktop version leverages the full power of the Rust processing pipeline.

```bash
npm run desktop:dev
```

#### Web Fallback

A high-compatibility web version using JavaScript processing.

```bash
npm run start
```

---

## 📦 Build & Distribution

- **Desktop App**: `npm run desktop:build`
- **Web App**: `npm run build`

---

*MagpieApp — Designed for the meticulous artisan.*
