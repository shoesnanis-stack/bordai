import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const WORKER_API_URL = process.env.WORKER_API_URL || 'http://localhost:8000'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { project_id, phase } = await request.json()

  // Verify project belongs to user
  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', project_id)
    .eq('user_id', user.id)
    .single()

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  // Create pipeline run record
  const { data: run, error } = await supabase
    .from('pipeline_runs')
    .insert({
      project_id,
      phase,
      status: 'processing',
      started_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Dispatch to Python worker
  try {
    await fetch(`${WORKER_API_URL}/api/pipeline/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id,
        phase,
        run_id: run.id,
        supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL,
        supabase_service_key: process.env.SUPABASE_SERVICE_ROLE_KEY,
      }),
    })
  } catch {
    // Worker might be down — update run status
    await supabase
      .from('pipeline_runs')
      .update({ status: 'failed', error: 'Worker unavailable' })
      .eq('id', run.id)

    return NextResponse.json(
      { error: 'Processing worker unavailable' },
      { status: 503 }
    )
  }

  return NextResponse.json({ run_id: run.id, status: 'processing' })
}
