import type { ExportFormat, HoopSize, MachineBrand, Surface } from '@/types'

// ─── Hoop sizes with dimensions in mm ──────────────────────────────

export const HOOP_SIZES: Record<HoopSize, { width: number; height: number; label: string }> = {
  '4x4': { width: 100, height: 100, label: '4x4 in (100x100 mm)' },
  '5x7': { width: 130, height: 180, label: '5x7 in (130x180 mm)' },
  '6x10': { width: 160, height: 260, label: '6x10 in (160x260 mm)' },
  '8x12': { width: 200, height: 300, label: '8x12 in (200x300 mm)' },
  '10x10': { width: 260, height: 260, label: '10x10 in (260x260 mm)' },
}

// ─── Machine brands → default export format ────────────────────────

export const MACHINE_FORMATS: Record<MachineBrand, ExportFormat> = {
  brother: 'PES',
  janome: 'JEF',
  bernina: 'EXP',
  tajima: 'DST',
  barudan: 'DST',
  pfaff: 'VIP',
  husqvarna: 'HUS',
  unknown: 'DST',
}

// ─── Surface options ────────────────────────────────────────────────

export const SURFACE_OPTIONS: { value: Surface; label: string }[] = [
  { value: 'cap', label: 'Gorra' },
  { value: 'shirt', label: 'Camisa / Polo' },
  { value: 'jacket', label: 'Chamarra / Sudadera' },
  { value: 'patch', label: 'Parche' },
  { value: 'other', label: 'Otro' },
]

// ─── Pipeline phase metadata ────────────────────────────────────────

export const PIPELINE_PHASES = [
  { phase: 'onboarding', label: 'Configuracion', description: 'Tipo de proyecto, superficie, aro y maquina' },
  { phase: 'ingestion', label: 'Comprension', description: 'IA analiza tu imagen y genera un brief' },
  { phase: 'extraction', label: 'Extraccion', description: 'Segmentacion, limpieza y mejora de imagen' },
  { phase: 'preparation', label: 'Preparacion', description: 'Vectorizacion y asignacion de puntadas' },
  { phase: 'preview', label: 'Vista previa', description: 'Simulacion interactiva del bordado' },
  { phase: 'generation', label: 'Generacion', description: 'Digitalizacion y exportacion del archivo' },
  { phase: 'delivery', label: 'Entrega', description: 'Descarga del archivo e instrucciones' },
] as const

// ─── Validation limits per machine type ─────────────────────────────

export const STITCH_LIMITS = {
  max_stitch_length_mm: 12,
  max_jump_length_mm: 12,
  density_range: { min: 3, max: 7 }, // stitches per mm
  max_color_changes: 20,
} as const

// ─── Thread palettes ────────────────────────────────────────────────

export const THREAD_PALETTES = ['madeira', 'robison-anton', 'isacord', 'gutermann'] as const
