import matter from "gray-matter"
import type { ParsedPrd, PrdFrontmatter } from "@/types/prd-parser"

const VALID_STATUSES = new Set(["queued", "in-progress", "completed"])
const CHECKBOX_RE = /^- \[(x| )\] (.+)$/gm

export function parsePrd(content: string): ParsedPrd {
  const { data } = matter(content)

  let frontmatter: PrdFrontmatter | null = null
  if (
    data &&
    typeof data.title === "string" &&
    typeof data.summary === "string" &&
    typeof data.status === "string" &&
    VALID_STATUSES.has(data.status)
  ) {
    frontmatter = {
      title: data.title,
      summary: data.summary,
      status: data.status as PrdFrontmatter["status"],
    }
  }

  const workItems: ParsedPrd["workItems"] = []
  // Search both body and full content (for files without frontmatter)
  const searchIn = content
  CHECKBOX_RE.lastIndex = 0
  for (let match = CHECKBOX_RE.exec(searchIn); match !== null; match = CHECKBOX_RE.exec(searchIn)) {
    workItems.push({ title: match[2].trim(), completed: match[1] === "x" })
  }

  return { frontmatter, workItems }
}
