import { parse as yamlParse } from "yaml"
import { z } from "zod"
import type { ManifestConfig } from "@/types/manifest"

const deploySchema = z.object({
  environment: z.string().min(1),
  url: z.string().min(1),
  health_check: z.string().optional(),
})

const manifestSchema = z.object({
  name: z.string().min(1),
  workflow: z.enum(["sdlc", "content"]),
  domain: z.string().min(1),
  owner: z.string().min(1),
  tags: z.array(z.string()).optional(),
  main_branch: z.string().optional(),
  branch_prefix: z.string().optional(),
  prd_path: z.string().optional(),
  test_pattern: z.string().optional(),
  content_path: z.string().optional(),
  draft_path: z.string().optional(),
  deploy: deploySchema.optional(),
})

export function parseManifest(yamlContent: string): ManifestConfig {
  let raw: unknown
  try {
    raw = yamlParse(yamlContent)
  } catch (err) {
    throw new Error(
      `Failed to parse manifest YAML: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Manifest YAML must be a mapping object")
  }

  const result = manifestSchema.safeParse(raw)
  if (!result.success) {
    const fields = result.error.issues.map((i) => i.path.join(".") || i.message).join(", ")
    throw new Error(`Invalid manifest: ${fields}`)
  }

  return result.data as ManifestConfig
}
