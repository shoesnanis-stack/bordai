// Layer system types for the embroidery editor

export type StitchTypeExtended =
  | 'tatami'
  | 'satin'
  | 'running'
  | 'triple'
  | 'plumetis'
  | 'cross_stitch'
  | 'motif'
  | 'bean'

export type UnderlayType = 'center_run' | 'edge_run' | 'zigzag_edge_run' | 'zigzag' | 'none'

export type AngleMode = 'fixed' | 'perpendicular' | 'contour_follow' | 'auto'

export type ContourType = 'running' | 'satin' | 'bean' | 'none'

export type SequencingMode = 'auto' | 'manual' | 'concentric'

export interface Layer {
  id: string
  name: string
  order: number
  enabled: boolean
  color_hex: string

  // Stitch type
  stitch_type: StitchTypeExtended

  // Angle
  angle_mode: AngleMode
  fill_angle: number           // 0-360, only used when angle_mode = 'fixed'

  // Fill params (tatami/plumetis)
  fill_density_mm: number      // 0.35 - 0.55
  fill_stitch_length_mm: number // 2.0 - 5.0
  fill_offset_pct: number      // offset between rows (0-100%)

  // Satin params
  satin_density_pct: number    // 65-85%
  satin_auto_split: boolean
  satin_max_width_mm: number
  satin_short_stitch: boolean
  satin_zigzag_spacing_mm: number

  // Underlay
  underlay_enabled: boolean
  underlay_type: UnderlayType
  underlay_density: number
  underlay_angle: number       // -1 = auto (perpendicular to fill)
  underlay_inset_mm: number
  underlay_stitch_length_mm: number

  // Compensation
  pull_compensation_mm: number
  push_compensation_mm: number

  // Contour
  contour_enabled: boolean
  contour_type: ContourType
  contour_offset_mm: number

  // Region reference
  mask_source: 'auto_color' | 'auto_shape' | 'manual'
  region_index: number
}

export interface GlobalStitchConfig {
  trim_threshold_mm: number
  tie_in_stitches: number
  tie_off_stitches: number
  tie_stitch_length_mm: number
  sequencing: SequencingMode
  color_order: 'light_first' | 'dark_first' | 'manual'
  stabilizer: 'tear-away' | 'cut-away' | 'wash-away'
}

export interface LayerConfig {
  layers: Layer[]
  global: GlobalStitchConfig
}

// Default layer with all params set to reasonable defaults
export function createDefaultLayer(overrides: Partial<Layer> = {}): Layer {
  return {
    id: crypto.randomUUID(),
    name: 'Nueva capa',
    order: 0,
    enabled: true,
    color_hex: '#000000',
    stitch_type: 'tatami',
    angle_mode: 'auto',
    fill_angle: 45,
    fill_density_mm: 0.40,
    fill_stitch_length_mm: 3.5,
    fill_offset_pct: 25,
    satin_density_pct: 75,
    satin_auto_split: true,
    satin_max_width_mm: 12,
    satin_short_stitch: false,
    satin_zigzag_spacing_mm: 0.4,
    underlay_enabled: true,
    underlay_type: 'zigzag_edge_run',
    underlay_density: 2.5,
    underlay_angle: -1,
    underlay_inset_mm: 0.5,
    underlay_stitch_length_mm: 3.0,
    pull_compensation_mm: 0.20,
    push_compensation_mm: 0.40,
    contour_enabled: true,
    contour_type: 'running',
    contour_offset_mm: 0,
    mask_source: 'auto_color',
    region_index: 0,
    ...overrides,
  }
}

export function createDefaultGlobalConfig(): GlobalStitchConfig {
  return {
    trim_threshold_mm: 3.0,
    tie_in_stitches: 3,
    tie_off_stitches: 3,
    tie_stitch_length_mm: 1.0,
    sequencing: 'auto',
    color_order: 'light_first',
    stabilizer: 'tear-away',
  }
}

// Pipeline node types for the visual editor
export type PipelineNodeType = 'ai_agent' | 'python_worker' | 'image_gen' | 'validator' | 'splitter' | 'merger' | 'export' | 'input' | 'custom'

export interface PipelineNodeConfig {
  id: string
  type: PipelineNodeType
  label: string
  description: string
  enabled: boolean
  config: Record<string, unknown>
}

export interface PipelineConfig {
  id: string
  name: string
  nodes: PipelineNodeConfig[]
  connections: { from: string; to: string }[]
}
