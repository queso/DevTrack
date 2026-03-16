import matter from "gray-matter"
import type { ContentFrontmatter, ParsedContent } from "@/types/content-parser"

const VALID_STATUSES = new Set(["draft", "published"])

interface ContentPathOptions {
  contentPath?: string
  draftPath?: string
}

export function parseContentFile(
  content: string,
  filePath: string,
  options: ContentPathOptions,
): ParsedContent {
  const { data } = matter(content)

  let frontmatter: ContentFrontmatter | null = null
  if (
    data &&
    typeof data.title === "string" &&
    typeof data.status === "string" &&
    VALID_STATUSES.has(data.status)
  ) {
    frontmatter = {
      title: data.title,
      status: data.status as ContentFrontmatter["status"],
      ...(typeof data.summary === "string" ? { summary: data.summary } : {}),
      ...(Array.isArray(data.tags) ? { tags: data.tags as string[] } : {}),
    }
  }

  const { draftPath, contentPath } = options
  const isDraft =
    frontmatter?.status === "draft" ||
    (draftPath != null && filePath.startsWith(draftPath)) ||
    (contentPath != null && !filePath.startsWith(contentPath))

  return { frontmatter, sourcePath: filePath, isDraft: !!isDraft }
}
