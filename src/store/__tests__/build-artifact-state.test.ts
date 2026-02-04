import { beforeEach, describe, expect, it } from 'vitest'
import { usePatternStore } from '@/store/pattern-store'
import type { BuildArtifact } from '@/types'

function makeArtifact(lockHash: string, regionCount: number): BuildArtifact {
  const width = regionCount
  const height = 1
  const pixelRegionId = new Uint32Array(regionCount)
  const regions = []
  for (let i = 1; i <= regionCount; i += 1) {
    pixelRegionId[i - 1] = i
    regions.push({
      id: i,
      colorIndex: 0,
      colorKey: 'RAW-1|#D62828',
      dmcCode: 'RAW-1',
      hex: '#D62828',
      bbox: { x0: i - 1, y0: 0, x1: i - 1, y1: 0 },
      area: 1,
    })
  }

  return {
    lockHash,
    width,
    height,
    regions,
    pixelRegionId,
    regionsByColor: [regions.map((region) => region.id)],
  }
}

describe('build artifact state hardening', () => {
  beforeEach(() => {
    usePatternStore.getState().reset()
  })

  it('restores done regions only when lock hash matches', () => {
    const state = usePatternStore.getState()
    state.setDoneRegionIds([1, 2, 999], 'lock-a')
    state.setBuildArtifact(makeArtifact('lock-b', 3), 'ready')
    expect(usePatternStore.getState().doneRegionIds).toEqual([])

    usePatternStore.getState().setDoneRegionIds([1, 2, 999], 'lock-b')
    usePatternStore.getState().setBuildArtifact(makeArtifact('lock-b', 3), 'ready')
    expect(usePatternStore.getState().doneRegionIds).toEqual([1, 2])
  })
})
