import { useEffect, useState } from 'react'
import { SelectionArtifactModel } from './model/SelectionArtifact'
import { usePatternStore } from './store/pattern-store'
import { useUIStore } from './store/ui-store'
import { useProjectHubStore } from './store/project-hub-store'
import { DMCTester } from './components/DMCTester'
import { logNormalizedImageDebug, logPatternPaletteDebug } from './processing/debug-color'
import { runPatternColorSanityTest } from './model/pattern-color.sanity'
import { getPlatformAdapter } from './platform'
import { normalizeImage, normalizeImageCapped } from './processing/image-utils'
import { HomeHub } from './components/project-hub/HomeHub'
import { captureProjectState, hydrateProjectFromDocument, loadProject, saveProject } from './project-hub/api'
import type { ProjectDocument } from './project-hub/types'

import { WorkflowStepper } from './components/workflow/WorkflowStepper'
import { FabricStage } from './components/workflow/FabricStage'
import { ReferenceStage } from './components/workflow/ReferenceStage'
import { SelectStage } from './components/workflow/SelectStage'
import { BuildStage } from './components/workflow/BuildStage'
import { ExportStage } from './components/workflow/ExportStage'
import { StageTransitionLayer } from './components/workflow/StageTransitionLayer'
import { MascotEyes } from './components/MascotEyes'
import { processPattern } from './processing/process-pattern'
import { incrementDevCounter } from './lib/dev-instrumentation'
import type { HoopShape } from './types'

export default function App() {
  const { normalizedImage, referenceId, selection, processingConfig, setPattern, isProcessing, setIsProcessing } = usePatternStore()
  const { workflowStage } = useUIStore()
  const {
    currentProjectId,
    currentProjectName,
    referenceImagePath,
    createdDate,
    isHubVisible,
    setHubVisible,
    setCurrentProject,
  } = useProjectHubStore()
  const [showDMCTester, setShowDMCTester] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isSavingProject, setIsSavingProject] = useState(false)
  const [showSplash, setShowSplash] = useState(true)
  const isDev = import.meta.env.DEV

  useEffect(() => {
    const timer = window.setTimeout(() => setShowSplash(false), 1200)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!isDev) return
    if (window.localStorage.getItem('magpie:runColorSanity') !== '1') return
    runPatternColorSanityTest()
  }, [isDev])

  useEffect(() => {
    if (!normalizedImage) return

    let isMounted = true
    const debugColor = isDev && window.localStorage.getItem('magpie:debugColor') === '1'

    async function updatePattern() {
      setIsProcessing(true)
      try {
        if (debugColor) logNormalizedImageDebug(normalizedImage!)

        const selectionForBuildRaw = selection
          ? SelectionArtifactModel.resampleTo(selection, normalizedImage!.width, normalizedImage!.height)
          : null
        const selectionSelectedCount = selectionForBuildRaw ? countSelectedPixels(selectionForBuildRaw.mask) : 0
        const selectionForBuild =
          selectionForBuildRaw && selectionSelectedCount > 0 ? selectionForBuildRaw : null

        if (isDev && selectionForBuildRaw && selectionSelectedCount === 0) {
          console.warn('[Magpie][SelectionBridge] Empty build mask detected; falling back to unmasked build render.')
        }

        // Use the unified processing API (automatically uses native on desktop)
        incrementDevCounter('processInvocations', 'App.updatePattern')

        const { pattern: nextPattern } = await processPattern({
          image: normalizedImage!,
          config: processingConfig,
          selection: selectionForBuild,
        })

        if (isMounted) {
          if (debugColor) logPatternPaletteDebug(nextPattern)
          setPattern(nextPattern)
        }
      } catch (err) {
        console.error('Failed to process pattern:', err)
      } finally {
        if (isMounted) setIsProcessing(false)
      }
    }

    updatePattern()

    return () => {
      isMounted = false
    }
  }, [
    normalizedImage,
    referenceId,
    selection?.id,
    processingConfig,
    setPattern,
    isDev
  ])

  async function handleCreateProject({
    projectName,
    referenceImagePath: nextReferencePath,
    hoopShape,
    hoopSizeMm,
  }: {
    projectName: string
    referenceImagePath: string
    hoopShape: HoopShape
    hoopSizeMm: number
  }) {
    const platform = await getPlatformAdapter()
    const imageBytes = await platform.readFile(nextReferencePath)
    const blobBytes = new Uint8Array(imageBytes)
    const sourceBlob = new Blob([blobBytes], { type: guessMimeType(nextReferencePath) })
    const sourceBitmap = await createImageBitmap(sourceBlob)
    const buildImage = normalizeImage(sourceBitmap, processingConfig.targetSize)
    const selectionImage = normalizeImageCapped(
      sourceBitmap,
      processingConfig.selectionWorkingSize,
      processingConfig.selectionMaxMegapixels
    )

    const patternStore = usePatternStore.getState()
    patternStore.setOriginalImage(sourceBitmap)
    patternStore.setSourceImages(buildImage, selectionImage)
    patternStore.setFabricSetup({ hoop: createInitialHoopConfig(hoopShape, hoopSizeMm) })

    const now = new Date().toISOString()
    setCurrentProject({
      projectId: createProjectId(projectName),
      projectName,
      createdDate: now,
      referenceImagePath: nextReferencePath,
    })
    useUIStore.getState().setWorkflowStage('Fabric', { acknowledge: false, source: 'system' })
    setHubVisible(false)
  }

  async function handleOpenProject(projectId: string) {
    const project = await loadProject(projectId)
    await hydrateProjectFromDocument(project)
    setCurrentProject({
      projectId: project.project_id,
      projectName: project.project_name,
      createdDate: project.created_date,
      referenceImagePath: project.reference_image_path,
    })
    setHubVisible(false)
  }

  async function handleSaveProject() {
    if (!currentProjectId || !currentProjectName || !referenceImagePath) {
      setSaveError('Create or open a project from Project Hub first.')
      return
    }
    setIsSavingProject(true)
    setSaveError(null)

    try {
      const snapshot = captureProjectState()
      const document: ProjectDocument = {
        project_id: currentProjectId,
        project_name: currentProjectName,
        created_date: createdDate ?? new Date().toISOString(),
        last_modified: new Date().toISOString(),
        reference_image_path: referenceImagePath,
        settings: {
          pixel_size: processingConfig.targetSize,
          color_count: processingConfig.colorCount,
          floss_brand: processingConfig.useDmcPalette ? 'DMC' : 'Custom',
        },
        state: snapshot,
        thumbnail_path: null,
      }
      await saveProject(document)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Project save failed.')
    } finally {
      setIsSavingProject(false)
    }
  }

  if (showSplash) {
    return (
      <div className="magpie-splash" role="status" aria-live="polite" aria-label="Loading Magpie">
        <span className="magpie-splash__wordmark">magpie.</span>
      </div>
    )
  }

  if (isDev && showDMCTester) {
    return (
      <div className="min-h-screen bg-gray-50">
        <MascotEyes />
        <div className="max-w-4xl mx-auto">
          <div className="bg-white shadow-sm border-b border-gray-200 p-4 flex items-center justify-between">
            <h1 className="text-xl font-bold">MagpieApp - DMC Test Mode</h1>
            <button
              onClick={() => setShowDMCTester(false)}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors text-sm"
            >
              Switch to Pattern Viewer
            </button>
          </div>
          <DMCTester />
        </div>
      </div>
    )
  }

  if (isHubVisible) {
    return (
      <>
        <HomeHub onCreateProject={handleCreateProject} onOpenProject={handleOpenProject} />
      </>
    )
  }

  const renderStage = () => {
    switch (workflowStage) {
      case 'Fabric':
        return <FabricStage />
      case 'Reference':
        return <ReferenceStage />
      case 'Select':
        return <SelectStage />
      case 'Build':
        return <BuildStage />
      case 'Export':
        return <ExportStage />
      default:
        return <FabricStage />
    }
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-white">
      <StageTransitionLayer />
      {isProcessing && (
        <div className="absolute inset-x-0 top-0 z-[100] flex justify-center pointer-events-none pt-16">
          <div className="bg-surface/95 px-5 py-2.5 rounded-full shadow-xl border border-border flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="w-1.5 h-1.5 rounded-full bg-fg animate-pulse" />
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-fg-subtle">Processing Pattern</span>
          </div>
        </div>
      )}
      <WorkflowStepper />
      <div className="absolute right-4 top-4 z-[110] flex items-center gap-2">
        <button
          type="button"
          onClick={() => setHubVisible(true)}
          className="rounded-md border border-border bg-surface px-3 py-2 text-xs font-bold uppercase tracking-wide text-fg hover:bg-surface-2"
        >
          Project Hub
        </button>
        <button
          type="button"
          onClick={() => void handleSaveProject()}
          disabled={isSavingProject}
          className="rounded-md border border-border-strong bg-accent-soft px-3 py-2 text-xs font-bold uppercase tracking-wide text-fg disabled:opacity-50"
        >
          {isSavingProject ? 'Saving...' : 'Save Project'}
        </button>
      </div>
      {saveError && (
        <div className="absolute left-1/2 top-16 z-[110] -translate-x-1/2 rounded-md border border-red-300 bg-red-50 px-4 py-2 text-xs text-red-700">
          {saveError}
        </div>
      )}

      <main className="flex-1 relative overflow-hidden">
        {isDev && (
          <div className="absolute top-4 right-4 z-50">
            <button
              onClick={() => setShowDMCTester(true)}
              className="px-3 py-1.5 bg-blue-500 text-white rounded-md text-xs font-bold hover:bg-blue-600 transition-colors shadow-lg"
            >
              DMC Test
            </button>
          </div>
        )}

        <div className={`stage-shell stage-shell--${workflowStage.toLowerCase()}`}>
          {renderStage()}
        </div>
      </main>
      <MascotEyes />
    </div>
  )
}

function countSelectedPixels(mask: Uint8Array): number {
  let selected = 0
  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i] > 0) selected += 1
  }
  return selected
}

function createProjectId(projectName: string): string {
  const slug = projectName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const token = Math.random().toString(36).slice(2, 8)
  return `${slug || 'project'}-${token}`
}

function guessMimeType(path: string): string {
  const lower = path.toLowerCase()
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.bmp')) return 'image/bmp'
  if (lower.endsWith('.gif')) return 'image/gif'
  return 'image/png'
}

function createInitialHoopConfig(shape: HoopShape, sizeMm: number) {
  const safeSize = Math.max(100, Math.round(sizeMm))
  const heightMm = shape === 'oval' ? Math.round(safeSize * 0.75) : safeSize
  const labelPrefix = shape === 'round' ? 'Round' : shape === 'square' ? 'Square' : 'Oval'
  const inches = (safeSize / 25.4).toFixed(1)
  return {
    presetId: `${shape}-${safeSize}`,
    label: `${labelPrefix} ${inches}"`,
    shape,
    widthMm: safeSize,
    heightMm,
    marginMm: 10,
  }
}
