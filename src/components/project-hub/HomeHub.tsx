import { useEffect, useMemo, useState } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { Button } from '@/components/ui'
import { getPlatformAdapter } from '@/platform'
import { getAllProjects } from '@/project-hub/api'
import type { ManifestEntry } from '@/project-hub/types'

interface NewProjectDraft {
  projectName: string
  referenceImagePath: string
}

interface HomeHubProps {
  onCreateProject: (draft: NewProjectDraft) => Promise<void> | void
  onOpenProject: (projectId: string) => Promise<void> | void
}

export function HomeHub({ onCreateProject, onOpenProject }: HomeHubProps) {
  const [projects, setProjects] = useState<ManifestEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isWizardOpen, setIsWizardOpen] = useState(false)
  const [draft, setDraft] = useState<NewProjectDraft>({
    projectName: '',
    referenceImagePath: '',
  })
  const [error, setError] = useState<string | null>(null)

  const canCreate = useMemo(
    () => draft.projectName.trim().length > 1 && draft.referenceImagePath.trim().length > 0,
    [draft.projectName, draft.referenceImagePath]
  )

  useEffect(() => {
    void refreshProjects()
  }, [])

  async function refreshProjects() {
    setLoading(true)
    setError(null)
    try {
      const entries = await getAllProjects()
      setProjects(entries)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load projects.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  async function chooseReferenceImage() {
    const platform = await getPlatformAdapter()
    if (!platform.isDesktop) {
      setError('Project Hub image picker is only available in desktop mode.')
      return
    }

    const path = await platform.selectOpenPath({
      title: 'Select Project Reference Image',
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }],
    })
    if (!path) return
    setDraft((current) => ({ ...current, referenceImagePath: path }))
  }

  async function handleCreate() {
    if (!canCreate || isSaving) return
    setIsSaving(true)
    setError(null)
    try {
      await onCreateProject({
        projectName: draft.projectName.trim(),
        referenceImagePath: draft.referenceImagePath.trim(),
      })
      setDraft({ projectName: '', referenceImagePath: '' })
      setIsWizardOpen(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not create project.'
      setError(message)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="h-screen overflow-auto bg-bg">
      <div className="mx-auto w-full max-w-6xl p-8">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-fg">Project Hub</h1>
            <p className="text-sm text-fg-muted">Create, save, and revisit embroidery projects in one place.</p>
          </div>
          <Button variant="primary" className="h-10 px-4 text-sm font-bold" onClick={() => setIsWizardOpen(true)}>
            Create New Project
          </Button>
        </header>

        {error && (
          <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-fg-subtle">Recent Projects</h2>
            <Button variant="ghost" size="sm" onClick={() => void refreshProjects()}>
              Refresh
            </Button>
          </div>

          {loading ? (
            <p className="text-sm text-fg-muted">Loading projects...</p>
          ) : projects.length === 0 ? (
            <div className="rounded-xl border border-border bg-surface p-6 text-sm text-fg-muted">
              No saved projects yet. Create one to start your workspace.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {projects.map((project) => (
                <button
                  key={project.project_id}
                  type="button"
                  onClick={() => void onOpenProject(project.project_id)}
                  className="group rounded-xl border border-border bg-surface p-3 text-left transition hover:-translate-y-0.5 hover:border-border-strong"
                >
                  <div className="mb-3 aspect-video overflow-hidden rounded-md bg-surface-2">
                    {project.thumbnail_path ? (
                      <img
                        src={convertFileSrc(project.thumbnail_path)}
                        alt={project.project_name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[11px] uppercase tracking-wider text-fg-subtle">
                        No Thumbnail
                      </div>
                    )}
                  </div>
                  <p className="truncate text-sm font-bold text-fg">{project.project_name}</p>
                  <p className="truncate text-[11px] text-fg-subtle">
                    Updated {new Date(project.last_modified).toLocaleString()}
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      {isWizardOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-6">
          <div className="w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-fg">Create New Project</h3>
            <p className="mt-1 text-sm text-fg-muted">Choose a name and source image for this workspace.</p>

            <div className="mt-5 space-y-4">
              <label className="block text-sm font-medium text-fg-muted">
                Project Name
                <input
                  className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg outline-none focus:border-border-strong"
                  value={draft.projectName}
                  onChange={(event) => setDraft((current) => ({ ...current, projectName: event.target.value }))}
                  placeholder="Spring Garden Sampler"
                />
              </label>

              <label className="block text-sm font-medium text-fg-muted">
                Reference Image
                <div className="mt-1 flex items-center gap-2">
                  <input
                    className="w-full rounded-md border border-border bg-bg px-3 py-2 text-xs text-fg-muted"
                    value={draft.referenceImagePath}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, referenceImagePath: event.target.value }))
                    }
                    placeholder="/path/to/reference.png"
                  />
                  <Button variant="secondary" onClick={() => void chooseReferenceImage()}>
                    Browse
                  </Button>
                </div>
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setIsWizardOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" disabled={!canCreate || isSaving} onClick={() => void handleCreate()}>
                {isSaving ? 'Creating...' : 'Create Project'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
