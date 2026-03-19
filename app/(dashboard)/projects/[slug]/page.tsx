import { ProjectPageClient } from "@/app/projects/[slug]/ProjectPageClient"

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <ProjectPageClient slug={slug} />
}
