# Stage 4 Pattern Generation (Deterministic Label-Map Pipeline)

Magpie Stage 4 now builds paint-by-number regions from a quantized label map (not edge stylization), so output is deterministic and printable.

## Pipeline

1. Edge-preserving denoise (`median_filter`) before quantization.
2. Quantize + DMC mapping in `embroidery::process_pattern` (Lab + CIEDE2000).
3. Build per-pixel label map from quantized stitches.
4. Extract connected components and region adjacency graph (RAG).
5. Deterministic merge:
   - tiny regions first (`min_region_area`)
   - stable tie-breakers (area, position, label, id)
   - neighbor choice uses shared boundary, then Lab distance, then stable geometry tie-breakers
6. Extract boundaries only from label transitions.
7. Simplify + smooth contours (`simplify_epsilon`, `smoothing_strength`, `smoothing_passes`).
8. Emit closed region paths + hole paths + legend entries.

## Stable Frontend Contract

Stage 4 now exposes a stable contract (`stage4`) alongside render-oriented region payloads:

- `stage4.regions[]`
  - `region_id`
  - `dmc_color_id`
  - `svg_path`
- `stage4.legend[]`
  - `dmc_color_id`
  - `name`
  - `area_px` (sum of region pixel areas; currently equivalent to stitch-cell count)
  - `region_count`
- `stage4.fallback_reason` (enum, optional)

This lets frontend consumers render Stage 4 deterministically without inferring color groupings.

## Deterministic Presets

Stage 4 presets are selected in Rust (not frontend heuristics):

- `Draft`: strongest simplification for fast, bold printable regions.
- `Standard`: balanced output for most embroidery patterns.
- `HighDetail`: preserves more contour detail while remaining deterministic.

Each preset maps to fixed deterministic values for `simplify_epsilon`, smoothing, and merge limits.

## Determinism Rules

- Color keys are normalized and sorted before label indexing.
- Region merges are deterministic (no RNG, no hash-map iteration order dependencies in final ordering).
- Final region IDs are assigned after a stable sort.

## Exact N Region Behavior

- Target region count is `Stage4Config.target_region_count`.
- If current region count > target, deterministic merges continue until target is reached or no legal merge remains.
- If current region count < target, Stage 4 does not split regions (to avoid artificial artifacts); it returns a deterministic fallback reason.
- Deterministic edge behavior:
  - `target N = 1`: merges all reachable regions into one region.
  - `target N > achievable`: returns `target_exceeds_feasible` fallback.
  - tiny border islands: merged deterministically via min-area policy.

## Tradeoffs

- Current smoothing is geometric (Chaikin-style) and keeps paths easy to render; it does not yet do curvature-aware corner classification.
- Region splitting is intentionally omitted in MVP to preserve deterministic, printable output.
- SVG export is generated from loops directly; no external GPL vectorization step is used.

## Why This Is Not ML

This pipeline is algorithmic image processing:

- explicit pixel-label maps
- deterministic graph merges
- deterministic geometry cleanup

There is no model training, no probabilistic sampling, and no cloud inference. Given the same image and settings, output is identical.

## Why Label Maps Beat Edge-Only Coloring-Book Pipelines

For embroidery, fill regions and legend integrity are primary constraints. Label maps keep region ownership explicit at every pixel, so:

- boundaries come from actual region transitions
- every region has a deterministic color identity
- legends are derived from region assignment, not guessed from stylized edges

Edge-only pipelines can look smooth, but they often lose fill ownership, produce open/ambiguous boundaries, and require heuristic post-reconstruction. Label maps avoid that ambiguity and produce embroidery-ready regions directly.

## Hole Behavior (Donut Regions)

- Stage 4 extracts multiple loops per connected region.
- The largest loop is treated as the outer boundary.
- Remaining loops are emitted as `holes_svg_paths` for that same region.
- Paths are not flattened into one compound `d` string in the contract; holes remain explicit for easier auditing.

## Fixture Harness (Manual Visual Verification)

Add local fixture images under:

- `src-tauri/tests/fixtures/stage4/`

Run:

```bash
cargo test stage4_fixture_export_harness --features stage4-fixtures -- --ignored --nocapture
```

Artifacts are written to:

- `$TMPDIR/magpie-stage4-fixtures/<fixture>/<preset>/stage4.svg`
- `$TMPDIR/magpie-stage4-fixtures/<fixture>/<preset>/legend.json`
- `$TMPDIR/magpie-stage4-fixtures/<fixture>/<preset>/preview.png`
