import { notFound } from "next/navigation"
import ProjectPage from "@/components/features/dashboard/project-page"
import { getProject, PROJECTS } from "@/lib/mock-data"

export function generateStaticParams() {
  return PROJECTS.map((p) => ({ slug: p.slug }))
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const project = getProject(slug)
  if (!project) notFound()

  return <ProjectPage slug={slug} />
}
