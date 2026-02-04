import { create } from 'zustand'

interface ProjectHubState {
  currentProjectId: string | null
  currentProjectName: string | null
  referenceImagePath: string | null
  createdDate: string | null
  isHubVisible: boolean
  setHubVisible: (visible: boolean) => void
  setCurrentProject: (project: {
    projectId: string
    projectName: string
    createdDate: string
    referenceImagePath: string
  }) => void
  clearCurrentProject: () => void
}

export const useProjectHubStore = create<ProjectHubState>((set) => ({
  currentProjectId: null,
  currentProjectName: null,
  referenceImagePath: null,
  createdDate: null,
  isHubVisible: true,
  setHubVisible: (isHubVisible) => set({ isHubVisible }),
  setCurrentProject: ({ projectId, projectName, createdDate, referenceImagePath }) =>
    set({
      currentProjectId: projectId,
      currentProjectName: projectName,
      createdDate,
      referenceImagePath,
      isHubVisible: false,
    }),
  clearCurrentProject: () =>
    set({
      currentProjectId: null,
      currentProjectName: null,
      referenceImagePath: null,
      createdDate: null,
      isHubVisible: true,
    }),
}))
