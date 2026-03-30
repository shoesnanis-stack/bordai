import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PreviewViewer } from '@/components/preview/preview-viewer'

export default async function PreviewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .single()

  if (!project) notFound()

  const { data: files } = await supabase
    .from('project_files')
    .select('*')
    .eq('project_id', id)
    .in('file_type', ['vectorized', 'preview'])

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold">Vista previa del bordado</h1>
      <p className="mb-6 text-sm text-gray-500">{project.name}</p>
      <PreviewViewer project={project} files={files ?? []} />
    </div>
  )
}
