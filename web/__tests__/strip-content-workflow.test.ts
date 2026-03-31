/**
 * Smoke tests for WI-008: Strip content workflow entirely.
 *
 * These tests verify the removal is COMPLETE. They fail while content code
 * exists and pass only after B.A. has deleted everything listed in the WI.
 *
 * Test strategy (task type → 3 smoke tests):
 * 1. Prisma schema has no content-related models, enums, or fields
 * 2. Content type files no longer exist in the codebase
 * 3. Content API route files no longer exist
 */

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = process.cwd()
const schema = existsSync(join(ROOT, "prisma", "schema.prisma"))
  ? readFileSync(join(ROOT, "prisma", "schema.prisma"), "utf-8")
  : ""

describe("WI-008: Content workflow stripped", () => {
  // -----------------------------------------------------------------------
  // 1. Prisma schema is clean of all content-related definitions
  // -----------------------------------------------------------------------
  it("prisma schema has no content-related models, enums, or fields", () => {
    // ContentItem model must be gone
    expect(schema).not.toMatch(/model\s+ContentItem\s*\{/)

    // ContentItemStatus enum must be gone
    expect(schema).not.toMatch(/enum\s+ContentItemStatus\s*\{/)

    // content_path and draft_path fields on Project must be gone
    expect(schema).not.toMatch(/content_path/)
    expect(schema).not.toMatch(/draft_path/)

    // content_published / content_updated EventType values must be gone
    expect(schema).not.toMatch(/content_published/)
    expect(schema).not.toMatch(/content_updated/)

    // Workflow enum (if it existed) must be gone — workflow is now a plain string
    // (or if kept as enum, must only contain sdlc)
    if (schema.match(/enum\s+Workflow\s*\{/)) {
      expect(schema).not.toMatch(/content/)
    }
  })

  // -----------------------------------------------------------------------
  // 2. Content type files no longer exist
  // -----------------------------------------------------------------------
  it("content type files are deleted from the types/ directory", () => {
    const contentTypeFiles = [
      join(ROOT, "types", "content.ts"),
      join(ROOT, "types", "content-sync.ts"),
      join(ROOT, "types", "content-parser.ts"),
    ]
    for (const file of contentTypeFiles) {
      expect(existsSync(file), `${file} should be deleted`).toBe(false)
    }
  })

  // -----------------------------------------------------------------------
  // 3. Content API route files no longer exist
  // -----------------------------------------------------------------------
  it("content API route files and directories are deleted", () => {
    const contentRoutes = [
      join(ROOT, "app", "api", "v1", "content"),
      join(ROOT, "app", "api", "v1", "projects", "[id]", "content"),
    ]
    for (const path of contentRoutes) {
      expect(existsSync(path), `${path} should be deleted`).toBe(false)
    }
  })
})
