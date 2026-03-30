import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PipelineTracker } from '@/components/pipeline/pipeline-tracker'

export default async function ProjectDetailPage({
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

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold">{project.name}</h1>
      <p className="mb-6 text-sm text-gray-500">
        {project.surface} &middot; {project.hoop_size} &middot; {project.machine_brand}
      </p>
      <PipelineTracker project={project} />
    </div>
  )
}
