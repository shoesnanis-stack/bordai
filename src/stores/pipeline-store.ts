import { create } from 'zustand'
import type { PipelinePhase, PhaseStatus } from '@/types'

interface PipelineState {
  phases: Record<PipelinePhase, PhaseStatus>
  currentPhase: PipelinePhase
  activeRunId: string | null

  setPhaseStatus: (phase: PipelinePhase, status: PhaseStatus) => void
  setCurrentPhase: (phase: PipelinePhase) => void
  setActiveRunId: (runId: string | null) => void
  reset: () => void
}

const initialPhases: Record<PipelinePhase, PhaseStatus> = {
  onboarding: 'pending',
  ingestion: 'pending',
  extraction: 'pending',
  preparation: 'pending',
  preview: 'pending',
  generation: 'pending',
  delivery: 'pending',
}

export const usePipelineStore = create<PipelineState>((set) => ({
  phases: { ...initialPhases },
  currentPhase: 'onboarding',
  activeRunId: null,

  setPhaseStatus: (phase, status) =>
    set((state) => ({
      phases: { ...state.phases, [phase]: status },
    })),
  setCurrentPhase: (currentPhase) => set({ currentPhase }),
  setActiveRunId: (activeRunId) => set({ activeRunId }),
  reset: () =>
    set({ phases: { ...initialPhases }, currentPhase: 'onboarding', activeRunId: null }),
}))
