import { create } from 'zustand'
import type { Project, ProjectFile, Brief } from '@/types'

interface ProjectState {
  project: Project | null
  files: ProjectFile[]
  brief: Brief | null
  loading: boolean
  error: string | null

  setProject: (project: Project) => void
  setFiles: (files: ProjectFile[]) => void
  setBrief: (brief: Brief) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  reset: () => void
}

export const useProjectStore = create<ProjectState>((set) => ({
  project: null,
  files: [],
  brief: null,
  loading: false,
  error: null,

  setProject: (project) => set({ project }),
  setFiles: (files) => set({ files }),
  setBrief: (brief) => set({ brief }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  reset: () =>
    set({ project: null, files: [], brief: null, loading: false, error: null }),
}))
