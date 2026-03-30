// ─── Enums ────────────────────────────────────────────────────────

export type ProjectType = 'upload_image' | 'text_only' | 'ready_design' | 'from_scratch'

export type Surface = 'cap' | 'shirt' | 'jacket' | 'patch' | 'other'

export type HoopSize = '4x4' | '5x7' | '6x10' | '8x12' | '10x10'

export type MachineBrand =
  | 'brother'
  | 'janome'
  | 'bernina'
  | 'tajima'
  | 'barudan'
  | 'pfaff'
  | 'husqvarna'
  | 'unknown'

export type ExportFormat = 'PES' | 'DST' | 'JEF' | 'VIP' | 'EXP' | 'XXX' | 'HUS'

export type PipelinePhase =
  | 'onboarding'
  | 'ingestion'
  | 'extraction'
  | 'preparation'
  | 'preview'
  | 'generation'
  | 'delivery'

export type PhaseStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'needs_approval'

export type StitchType = 'tatami' | 'satin' | 'running' | 'triple'

export type FeedbackRating = 'perfect' | 'minor_adjustments' | 'problems'

// ─── Entities ─────────────────────────────────────────────────────

export interface Profile {
  id: string
  email: string
  full_name: string | null
  plan: 'free' | 'starter' | 'pro' | 'enterprise'
  default_machine: MachineBrand | null
  created_at: string
}

export interface Project {
  id: string
  user_id: string
  name: string
  type: ProjectType
  surface: Surface
  hoop_size: HoopSize
  machine_brand: MachineBrand
  export_format: ExportFormat
  current_phase: PipelinePhase
  status: 'draft' | 'processing' | 'preview_ready' | 'approved' | 'completed'
  created_at: string
  updated_at: string
}

export interface ProjectFile {
  id: string
  project_id: string
  phase: PipelinePhase
  file_type: 'original' | 'extracted' | 'upscaled' | 'generated' | 'vectorized' | 'embroidery' | 'preview' | 'instructions_pdf'
  storage_path: string
  mime_type: string
  metadata: Record<string, unknown>
  created_at: string
}

export interface Brief {
  id: string
  project_id: string
  version: number
  content: string // LLM-generated understanding in plain language
  intent: {
    elements_to_keep: string[]
    elements_to_discard: string[]
    elements_to_add: string[]
    estimated_thread_colors: number
  }
  approved: boolean
  created_at: string
}

export interface PipelineRun {
  id: string
  project_id: string
  phase: PipelinePhase
  status: PhaseStatus
  started_at: string
  completed_at: string | null
  error: string | null
  metadata: Record<string, unknown>
}

export interface EmbroideryParams {
  regions: EmbroideryRegion[]
  total_stitches: number
  estimated_time_minutes: number
  thread_colors: ThreadColor[]
  dimensions: { width_mm: number; height_mm: number }
}

export interface EmbroideryRegion {
  id: string
  stitch_type: StitchType
  density: number // stitches per mm
  angle: number // fill angle in degrees
  underlay: boolean
  color_index: number
}

export interface ThreadColor {
  index: number
  name: string
  hex: string
  palette: string // e.g. 'madeira', 'robison-anton'
  code: string // manufacturer color code
}

export interface Feedback {
  id: string
  project_id: string
  rating: FeedbackRating
  broke_thread: boolean
  wrinkled_fabric: boolean
  gaps_in_fill: boolean
  color_issues: boolean
  notes: string | null
  created_at: string
}

// ─── API Payloads ─────────────────────────────────────────────────

export interface CreateProjectPayload {
  name: string
  type: ProjectType
  surface: Surface
  hoop_size: HoopSize
  machine_brand: MachineBrand
}

export interface PipelineStatusResponse {
  project_id: string
  current_phase: PipelinePhase
  phases: Record<PipelinePhase, PhaseStatus>
  preview_url: string | null
}
