import { notFound } from "next/navigation"
import Sidebar from "@/components/sidebar"
import ProjectPage from "@/components/project-page"
import { getProject, PROJECTS } from "@/lib/mock-data"

export function generateStaticParams() {
  return PROJECTS.map((p) => ({ slug: p.slug }))
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const project = getProject(slug)
  if (!project) notFound()

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-auto">
        <ProjectPage slug={slug} />
      </main>
    </div>
  )
}
