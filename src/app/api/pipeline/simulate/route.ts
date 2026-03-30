import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/pipeline/simulate
 * Runs all pipeline phases sequentially for a project, capturing results at each step.
 * The project must have an uploaded image (F0 complete).
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { project_id } = await request.json()

  const admin = createAdminClient()

  const { data: project } = await admin
    .from('projects')
    .select('*')
    .eq('id', project_id)
    .eq('user_id', user.id)
    .single()

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  // Verify there's an original image
  const { data: original } = await admin
    .from('project_files')
    .select('*')
    .eq('project_id', project_id)
    .eq('file_type', 'original')
    .single()

  if (!original) {
    return NextResponse.json({
      error: 'No original image found. Upload an image first (F0).',
    }, { status: 400 })
  }

  const steps: {
    phase: string
    ok: boolean
    duration_ms: number
    output: Record<string, unknown>
    error?: string
  }[] = []

  const baseUrl = request.headers.get('origin') || request.headers.get('referer')?.replace(/\/[^/]*$/, '') || ''
  const cookies = request.headers.get('cookie') || ''

  async function callStep(phase: string, url: string, method: string, body?: object) {
    const start = Date.now()
    try {
      const opts: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Cookie': cookies,
        },
      }
      if (body) opts.body = JSON.stringify(body)

      const res = await fetch(`${baseUrl}${url}`, opts)
      const data = await res.json()
      const duration = Date.now() - start

      if (!res.ok) {
        steps.push({ phase, ok: false, duration_ms: duration, output: {}, error: data.error ?? `HTTP ${res.status}` })
        return null
      }

      steps.push({ phase, ok: true, duration_ms: duration, output: data })
      return data
    } catch (err) {
      const duration = Date.now() - start
      const msg = err instanceof Error ? err.message : 'Unknown error'
      steps.push({ phase, ok: false, duration_ms: duration, output: {}, error: msg })
      return null
    }
  }

  // Step 1: Analyze (F1)
  const analysis = await callStep('analyze', '/api/pipeline/analyze', 'POST', { project_id })
  if (!analysis) {
    return NextResponse.json({ success: false, steps, stopped_at: 'analyze' })
  }

  // Step 2: Approve brief
  const approveStart = Date.now()
  try {
    await admin
      .from('briefs')
      .update({ approved: true })
      .eq('project_id', project_id)

    await admin
      .from('projects')
      .update({ current_phase: 'extraction' })
      .eq('id', project_id)

    steps.push({
      phase: 'approve',
      ok: true,
      duration_ms: Date.now() - approveStart,
      output: { approved: true },
    })
  } catch (err) {
    steps.push({
      phase: 'approve',
      ok: false,
      duration_ms: Date.now() - approveStart,
      output: {},
      error: err instanceof Error ? err.message : 'Failed to approve',
    })
    return NextResponse.json({ success: false, steps, stopped_at: 'approve' })
  }

  // Step 3: Skip extraction (copy original → extracted)
  const extractStart = Date.now()
  try {
    // Check if extracted file already exists
    const { data: existing } = await admin
      .from('project_files')
      .select('id')
      .eq('project_id', project_id)
      .eq('file_type', 'extracted')
      .single()

    if (!existing) {
      await admin.from('project_files').insert({
        project_id,
        phase: 'extraction',
        file_type: 'extracted',
        storage_path: original.storage_path,
        mime_type: original.mime_type,
        metadata: { skipped_extraction: true, simulated: true },
      })
    }

    await admin
      .from('projects')
      .update({ current_phase: 'preparation' })
      .eq('id', project_id)

    steps.push({
      phase: 'extract',
      ok: true,
      duration_ms: Date.now() - extractStart,
      output: { skipped: true },
    })
  } catch (err) {
    steps.push({
      phase: 'extract',
      ok: false,
      duration_ms: Date.now() - extractStart,
      output: {},
      error: err instanceof Error ? err.message : 'Extraction failed',
    })
    return NextResponse.json({ success: false, steps, stopped_at: 'extract' })
  }

  // Step 4: Prepare (F3)
  const preparation = await callStep('prepare', '/api/pipeline/prepare', 'POST', { project_id })
  if (!preparation) {
    return NextResponse.json({ success: false, steps, stopped_at: 'prepare' })
  }

  // Step 5: Generate (F5)
  const generation = await callStep('generate', '/api/pipeline/generate', 'POST', { project_id })
  if (!generation) {
    return NextResponse.json({ success: false, steps, stopped_at: 'generate' })
  }

  const totalDuration = steps.reduce((sum, s) => sum + s.duration_ms, 0)

  return NextResponse.json({
    success: true,
    steps,
    total_duration_ms: totalDuration,
    final_download_url: generation.download_url,
    summary: {
      total_stitches: generation.debug?.total_stitches ?? generation.summary?.total_stitches ?? 0,
      colors: generation.summary?.colors ?? 0,
      dimensions: generation.summary?.dimensions ?? '',
      mask_method: generation.debug?.mask_method ?? 'unknown',
      format: project.export_format,
    },
  })
}
