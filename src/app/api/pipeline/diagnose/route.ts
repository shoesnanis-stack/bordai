import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const project_id = searchParams.get('project_id')
  if (!project_id) return NextResponse.json({ error: 'project_id required' }, { status: 400 })

  const admin = createAdminClient()

  // Get project
  const { data: project } = await admin
    .from('projects')
    .select('*')
    .eq('id', project_id)
    .eq('user_id', user.id)
    .single()

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  // Get all project files
  const { data: files } = await admin
    .from('project_files')
    .select('*')
    .eq('project_id', project_id)
    .order('created_at', { ascending: true })

  // Get briefs
  const { data: briefs } = await admin
    .from('briefs')
    .select('*')
    .eq('project_id', project_id)
    .order('created_at', { ascending: true })

  const filesByType: Record<string, typeof files extends (infer T)[] | null ? T : never> = {}
  for (const f of files ?? []) {
    filesByType[f.file_type] = f
  }

  const latestBrief = briefs?.[briefs.length - 1]
  const vectorized = filesByType['vectorized']
  const embroidery = filesByType['embroidery']
  const original = filesByType['original']

  // Build per-phase diagnostics
  const phases = []

  // F0 Onboarding
  phases.push({
    phase: 'onboarding',
    status: original ? 'complete' : 'missing',
    details: original ? {
      file: original.storage_path?.split('/').pop() ?? 'unknown',
      mime: original.mime_type,
      size_kb: original.metadata?.size ? Math.round(original.metadata.size / 1024) : null,
    } : { error: 'No se encontro imagen original' },
  })

  // F1 Ingestion
  phases.push({
    phase: 'ingestion',
    status: latestBrief ? 'complete' : 'pending',
    details: latestBrief ? {
      brief: latestBrief.content,
      approved: latestBrief.approved,
      quality: latestBrief.intent?.image_quality ?? 'not set',
      complexity: latestBrief.intent?.complexity ?? 'not set',
      colors_estimated: latestBrief.intent?.estimated_thread_colors ?? 0,
      elements_to_keep: latestBrief.intent?.elements_to_keep ?? [],
      elements_to_discard: latestBrief.intent?.elements_to_discard ?? [],
      warnings: latestBrief.intent?.warnings ?? [],
    } : { error: 'IA no ha analizado la imagen todavia' },
  })

  // F2 Extraction
  const extracted = filesByType['extracted']
  phases.push({
    phase: 'extraction',
    status: extracted ? 'complete' : 'pending',
    details: extracted ? {
      skipped: extracted.metadata?.skipped_extraction ?? false,
    } : { info: 'Fase pendiente o saltada' },
  })

  // F3 Preparation
  const digitization = vectorized?.metadata ?? null
  phases.push({
    phase: 'preparation',
    status: digitization ? 'complete' : 'pending',
    details: digitization ? {
      regions_count: digitization.regions?.length ?? 0,
      regions: (digitization.regions ?? []).map((r: Record<string, unknown>) => ({
        name: r.name,
        stitch_type: r.stitch_type,
        color_hex: r.color_hex,
        density: r.density,
        angle: r.angle ?? 0,
        underlay: r.underlay ?? false,
      })),
      thread_colors: digitization.thread_colors ?? [],
      stitches_estimate: digitization.total_stitches_estimate ?? 0,
      dimensions: `${digitization.width_mm ?? 0}x${digitization.height_mm ?? 0}mm`,
      notes: digitization.notes ?? '',
    } : { info: 'GPT-4o no ha asignado puntadas todavia' },
  })

  // F5 Generation
  phases.push({
    phase: 'generation',
    status: embroidery ? 'complete' : 'pending',
    details: embroidery ? {
      format: embroidery.metadata?.format ?? project.export_format,
      size_kb: embroidery.metadata?.size_bytes ? Math.round(embroidery.metadata.size_bytes / 1024) : 0,
      mask_method: embroidery.metadata?.debug_mask_method ?? 'unknown',
      total_stitches: embroidery.metadata?.debug_total_stitches ?? 0,
      regions: embroidery.metadata?.debug_regions ?? [],
      python_log: embroidery.metadata?.debug_log ?? [],
    } : { info: 'Archivo de bordado no generado todavia' },
  })

  // Automatic problem detection
  const problems: string[] = []

  if (!original) {
    problems.push('No hay imagen original subida')
  }
  if (latestBrief && !latestBrief.approved) {
    problems.push('El brief no ha sido aprobado')
  }
  if (latestBrief && !latestBrief.intent?.image_quality) {
    problems.push('image_quality no fue guardado en el brief (datos incompletos de la IA)')
  }
  if (digitization && (!digitization.regions || digitization.regions.length === 0)) {
    problems.push('GPT-4o no devolvio regiones en la preparacion')
  }
  if (digitization?.regions) {
    const allSameColor = new Set(digitization.regions.map((r: Record<string, string>) => r.color_hex)).size <= 1
    if (allSameColor && digitization.regions.length > 1) {
      problems.push('Todas las regiones tienen el mismo color — la IA no detecto colores distintos')
    }
  }
  if (embroidery) {
    const stitches = embroidery.metadata?.debug_total_stitches ?? 0
    if (stitches < 100) {
      problems.push(`Solo ${stitches} puntadas generadas — posible error de mascara (deberia ser 5,000+)`)
    }
    if (embroidery.metadata?.size_bytes === 0) {
      problems.push('El archivo de bordado tiene 0 bytes')
    }
    if (embroidery.metadata?.debug_mask_method === 'brightness') {
      problems.push('Se uso el fallback de brillo para la mascara — la deteccion de alfa y bordes fallo')
    }
  }

  return NextResponse.json({
    project: {
      name: project.name,
      phase: project.current_phase,
      status: project.status,
      hoop: project.hoop_size,
      machine: project.machine_brand,
      format: project.export_format,
      surface: project.surface,
    },
    phases,
    problems,
  })
}
