import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: run } = await supabase
    .from('pipeline_runs')
    .select('*, projects!inner(user_id)')
    .eq('id', id)
    .single()

  if (!run || run.projects.user_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({
    id: run.id,
    phase: run.phase,
    status: run.status,
    started_at: run.started_at,
    completed_at: run.completed_at,
    error: run.error,
    metadata: run.metadata,
  })
}
