# Artisan Studio Engineering Notes

## `.magpie` project format (v1)

Top-level fields:

- `version`: schema version (`1` today).
- `createdAt`: ISO timestamp for file creation.
- `savedAt`: ISO timestamp for latest save.
- `appVersion` (optional): build version string when available.
- `workflowStage`, `sourceImage`, `fabricSetup`, `referencePlacement`, `processingConfig`, `maskConfig`, `selection`, `manualEdits`, `manualEditTool`.

Notes:

- Source image is stored as PNG base64 in `sourceImage.dataBase64`.
- `manualEdits` stores coordinate-based overrides (`paint` or `fabric`), and `manualEditTool` persists the selected edit tool.
- Parsing flows through `parseAndMigrateProjectFile` -> `migrateProjectFile` (stubbed for future versions).

## Migrations

Add future migrations in `src/project/persistence.ts` inside `migrateProjectFile`.

- Keep the latest runtime shape as `MagpieProjectFileV1` (or future `Vn`).
- Convert older versions into the current shape before loading into stores.
- Throw clear user-facing errors for unknown/newer versions.

## Manual edits overlay model

- Base processed output is stored in `pattern-store` as `basePattern`.
- Display/export pattern is `basePattern + manualEdits` via `applyManualEditsToPattern`.
- Reprocessing (config/palette changes) replaces `basePattern`; edits are re-applied deterministically by coordinate.
- Clearing edits resets to `basePattern` without forcing a reprocess.

## PDF export pipeline

- Frontend sends final stitches + legend + `page_size` (`A4`/`Letter`) to native command.
- Rust builds vector PDF pages directly (no raster embedding):
  - Grid and swatches are PDF vector rectangles/lines.
  - Stitch symbols are vector glyphs built from fixed 5x7 geometry.
- `GridLayout` defines one coordinate mapping (`cell -> PDF`) used consistently for backgrounds and symbols.

## Acceptance checklist

- Export PDF with both `A4` and `Letter`; verify crisp grid/symbols at 400% zoom.
- Save/load `.magpie`; verify recent entries self-heal when files are missing.
- Manual paint + fabric erase survive reprocess (e.g., change color count).
- Manifest stitch counts in export match on-screen edited pattern.
