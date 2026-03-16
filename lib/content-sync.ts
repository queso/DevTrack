import * as fs from "node:fs"
import { parseContentFile } from "@/lib/content-parser"
import type { ContentSyncOptions, ContentSyncRecord, ContentSyncResult } from "@/types/content-sync"

export async function syncContent(options: ContentSyncOptions): Promise<ContentSyncResult> {
  const { projectId, contentPath, draftPath, changedFiles, apiUrl, apiKey } = options

  const synced: ContentSyncRecord[] = []
  const skipped: string[] = []

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  }

  for (const filePath of changedFiles) {
    const inContent = contentPath && filePath.startsWith(contentPath)
    const inDraft = draftPath && filePath.startsWith(draftPath)

    if (!inContent && !inDraft) {
      skipped.push(filePath)
      continue
    }

    try {
      const raw = fs.readFileSync(filePath, "utf-8") as string
      const parsed = parseContentFile(raw, filePath, { contentPath, draftPath })

      if (!parsed.frontmatter) {
        skipped.push(filePath)
        continue
      }

      const { frontmatter, isDraft } = parsed
      const isPublished = !isDraft
      const status: "draft" | "published" = isPublished ? "published" : "draft"

      const payload: Record<string, unknown> = {
        title: frontmatter.title,
        status,
        source_path: filePath,
      }
      if (frontmatter.summary !== undefined) payload.summary = frontmatter.summary
      if (frontmatter.tags !== undefined) payload.tags = frontmatter.tags

      let contentItemId: string | null = null
      let created = false
      let updated = false

      try {
        const res = await fetch(`${apiUrl}/api/v1/projects/${projectId}/content`, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        })

        if (res.ok) {
          const data = (await res.json()) as { data?: { id?: string } }
          contentItemId = data?.data?.id ?? null
          if (res.status === 201) {
            created = true
          } else {
            updated = true
          }
        }
      } catch {
        skipped.push(filePath)
        continue
      }

      const eventType = isPublished ? "content_published" : "content_updated"
      let eventRecorded = false

      if (contentItemId) {
        try {
          const evRes = await fetch(`${apiUrl}/api/v1/projects/${projectId}/events`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              project_id: projectId,
              type: eventType,
              title: `${isPublished ? "Published" : "Updated"}: ${frontmatter.title}`,
              metadata: { source_path: filePath, content_item_id: contentItemId },
              occurred_at: new Date().toISOString(),
            }),
          })
          eventRecorded = evRes.ok
        } catch {
          // Silent — event failure doesn't fail the sync
        }
      }

      synced.push({
        filePath,
        contentItemId,
        created,
        updated,
        published: isPublished,
        eventType,
        eventRecorded,
      })
    } catch {
      skipped.push(filePath)
    }
  }

  return { synced, skipped }
}
