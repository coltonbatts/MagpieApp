import type {
  FabricSetup,
  MagicWandConfig,
  ManualStitchEdit,
  ManualStitchEditMode,
  MaskConfig,
  ProcessingConfig,
  ReferencePlacement,
  RefinementConfig,
  WorkflowStage,
} from '@/types'

export interface ProjectSettings {
  pixel_size: number
  color_count: number
  floss_brand: string
}

export interface ManifestEntry {
  project_id: string
  project_name: string
  created_date: string
  last_modified: string
  reference_image_path: string
  thumbnail_path?: string | null
}

export interface SerializedSelection {
  id: string
  referenceId: string
  width: number
  height: number
  isDefault: boolean
  maskBase64: string
}

export interface ProjectStateV1 {
  version: 1
  workflow_stage: WorkflowStage
  fabric_setup: FabricSetup
  reference_placement: ReferencePlacement | null
  composition_locked: boolean
  processing_config: ProcessingConfig
  mask_config: MaskConfig
  magic_wand_config: MagicWandConfig
  refinement_config: RefinementConfig
  selection: SerializedSelection | null
  manual_edits: ManualStitchEdit[]
  manual_edit_tool: ManualStitchEditMode
  done_region_ids: number[]
  done_region_lock_hash: string | null
}

export interface ProjectDocument {
  project_id: string
  project_name: string
  created_date: string
  last_modified: string
  reference_image_path: string
  settings: ProjectSettings
  state: ProjectStateV1
  thumbnail_path?: string | null
}
