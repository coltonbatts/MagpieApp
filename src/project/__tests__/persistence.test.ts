import { describe, expect, it } from 'vitest'
import {
  createProjectFile,
  migrateProjectFile,
  parseAndMigrateProjectFile,
  stringifyProjectFile,
} from '../persistence'

describe('project persistence format', () => {
  it('roundtrips a v1 project file', () => {
    const project = createProjectFile({
      workflowStage: 'Build',
      sourceImage: {
        mime: 'image/png',
        width: 8,
        height: 8,
        dataBase64: 'AA==',
      },
      fabricSetup: {
        type: 'linen',
        texture: 'natural',
        count: 14,
        color: { r: 245, g: 245, b: 220 },
        hoop: { presetId: 'round-150', label: 'Round 150mm', shape: 'round', widthMm: 150, heightMm: 150 },
      },
      referencePlacement: null,
      processingConfig: {
        colorCount: 16,
        ditherMode: 'none',
        targetSize: 256,
        selectionWorkingSize: 1024,
        selectionMaxMegapixels: 2,
        useDmcPalette: true,
        smoothingAmount: 0.2,
        simplifyAmount: 0.1,
        minRegionSize: 2,
        fabricColor: { r: 245, g: 245, b: 220 },
        stitchThreshold: 0.1,
        organicPreview: false,
      },
      maskConfig: {
        brushSize: 20,
        opacity: 0.5,
      },
      selection: null,
      manualEdits: [{ x: 1, y: 1, mode: 'fabric' }],
      manualEditTool: 'fabric',
    })

    const parsed = parseAndMigrateProjectFile(stringifyProjectFile(project))
    expect(parsed.version).toBe(1)
    expect(parsed.createdAt).toBeTruthy()
    expect(parsed.manualEdits).toEqual(project.manualEdits)
    expect(parsed.manualEditTool).toBe('fabric')
  })

  it('fails on unsupported version (migration stub)', () => {
    expect(() =>
      migrateProjectFile({
        version: 2,
        sourceImage: { mime: 'image/png', width: 1, height: 1, dataBase64: 'AA==' },
        processingConfig: {},
        fabricSetup: {},
      })
    ).toThrow(/version 2 is not supported/i)
  })
})

