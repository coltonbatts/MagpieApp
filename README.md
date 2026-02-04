# MagpieApp

Vite + React + TypeScript + Tailwind + Pixi app for generating stitch patterns and exporting PNG.

## Quick Runbook

### Prerequisites

- Node.js **18+** (recommended; this repo does not pin a stricter engine)

### Install

```bash
npm install
```

### Native Desktop App (Recommended for Performance)

This app includes a native Rust backend for high-performance pattern processing.

```bash
npm run desktop:dev
```

- Requires **Rust** and **Tauri** dependencies installed on your system.
- Leverages `rayon` for parallel processing and `CIEDE2000` for color matching.
- UI includes a "Processing Pattern..." indicator during native computation.

### Local Web Development (Fallback)

```bash
npm run start
```

- Runs in the browser with JavaScript processing.
- Automatically falls back to JS if not running in the Tauri environment.

## Pattern Viewer vs Dev-only tools

- **Pattern Viewer** is the default app screen.
- In dev mode, a top-right button **"Test DMC Matcher"** opens the dev-only DMC tester.
- Use **"Switch to Pattern Viewer"** to return from DMC test mode.

## Export PNG smoke test

1. Start the app (`npm run start`) and open `http://localhost:5173`.
2. In the control panel, click **Upload image** and select any JPG/PNG/WEBP.
3. Wait for normalization text (`Normalized to ... px`) and pattern render.
4. Click **Export PNG**.
5. Confirm the file appears in your browser's Downloads location.
6. Verify filename:
   - Raw palette mode: `magpie-pattern-raw.png`
   - DMC palette mode (toggle **Map palette to DMC thread colors**): `magpie-pattern-dmc.png`
7. In dev mode, verify checksum line appears under Export:
   - Format: `Export checksum: <width>x<height> | stitch <N>px | palette <count> | mode <raw|dmc>`
8. If no pattern is loaded, Export is disabled and shows: **"Load an image/pattern first."**
