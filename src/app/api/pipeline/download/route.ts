import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const project_id = searchParams.get('project_id')
  if (!project_id) return NextResponse.json({ error: 'Missing project_id' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // Verify project belongs to user
  const { data: project } = await admin
    .from('projects')
    .select('id')
    .eq('id', project_id)
    .eq('user_id', user.id)
    .single()

  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: file } = await admin
    .from('project_files')
    .select('storage_path')
    .eq('project_id', project_id)
    .eq('file_type', 'embroidery')
    .single()

  if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 })

  const { data: signedUrl } = await admin.storage
    .from('project-files')
    .createSignedUrl(file.storage_path, 3600)

  return NextResponse.json({ url: signedUrl?.signedUrl })
}
