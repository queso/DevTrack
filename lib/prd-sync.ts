import * as fs from "node:fs"
import { parsePrd } from "@/lib/prd-parser"
import type { PrdSyncOptions, PrdSyncRecord, PrdSyncResult } from "@/types/prd-sync"

export async function syncPrds(options: PrdSyncOptions): Promise<PrdSyncResult> {
  const { projectId, prdPath, changedFiles, apiUrl, apiKey } = options

  const synced: PrdSyncRecord[] = []
  const skipped: string[] = []

  const prdFiles = changedFiles.filter((f) => f.startsWith(prdPath))
  const nonPrdFiles = changedFiles.filter((f) => !f.startsWith(prdPath))

  skipped.push(...nonPrdFiles)

  for (const filePath of prdFiles) {
    try {
      const content = fs.readFileSync(filePath, "utf-8") as string
      const parsed = parsePrd(content)

      if (!parsed.frontmatter) {
        skipped.push(filePath)
        continue
      }

      const { frontmatter, workItems } = parsed

      // POST to create/update PRD
      const prdPayload = {
        title: frontmatter.title,
        summary: frontmatter.summary,
        status: frontmatter.status,
        source_path: filePath,
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      }

      let prdId: string | null = null
      let created = false
      let updated = false

      try {
        const prdRes = await fetch(`${apiUrl}/api/v1/projects/${projectId}/prds`, {
          method: "POST",
          headers,
          body: JSON.stringify(prdPayload),
        })

        if (prdRes.ok) {
          const data = (await prdRes.json()) as { data?: { id?: string } }
          prdId = data?.data?.id ?? null
          if (prdRes.status === 201) {
            created = true
          } else {
            updated = true
          }
        }
      } catch {
        skipped.push(filePath)
        continue
      }

      // Sync work items
      let workItemsSynced = 0
      if (prdId && workItems.length > 0) {
        for (let i = 0; i < workItems.length; i++) {
          const wi = workItems[i]
          const wiPayload = {
            title: wi.title,
            status: wi.completed ? "done" : "todo",
            order: i,
            prd_id: prdId,
          }
          try {
            await fetch(`${apiUrl}/api/v1/prds/${prdId}/work-items`, {
              method: "POST",
              headers,
              body: JSON.stringify(wiPayload),
            })
            workItemsSynced++
          } catch {
            // Continue — work item failure doesn't block PRD sync
          }
        }
      }

      // Record prd_synced event
      let eventRecorded = false
      if (prdId) {
        try {
          const eventRes = await fetch(`${apiUrl}/api/v1/projects/${projectId}/events`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              project_id: projectId,
              type: "prd_synced",
              title: `PRD synced: ${frontmatter.title}`,
              metadata: { source_path: filePath, prd_id: prdId },
              occurred_at: new Date().toISOString(),
            }),
          })
          eventRecorded = eventRes.ok
        } catch {
          // Silent — event failure doesn't fail the sync
        }
      }

      synced.push({
        filePath,
        prdId,
        created,
        updated,
        workItemsSynced,
        eventRecorded,
      })
    } catch {
      skipped.push(filePath)
    }
  }

  return { synced, skipped }
}
