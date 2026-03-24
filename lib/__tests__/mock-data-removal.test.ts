/**
 * Smoke tests for WI-009: Remove dead mock data file.
 *
 * These tests verify removal is COMPLETE. They fail while mock-data.ts
 * exists and pass only after B.A. has deleted the file and all imports.
 *
 * Test strategy (task type → 2 smoke tests):
 * 1. lib/mock-data.ts file does not exist
 * 2. No .ts/.tsx source files import from mock-data (outside of test files)
 */

import { execSync } from "node:child_process"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = process.cwd()

describe("WI-009: mock-data.ts removed", () => {
  it("lib/mock-data.ts file is deleted", () => {
    expect(
      existsSync(join(ROOT, "lib", "mock-data.ts")),
      "lib/mock-data.ts should be deleted — it is dead code after WI-001 and WI-008",
    ).toBe(false)
  })

  it("no .ts/.tsx source files import from mock-data", () => {
    // Search all TS/TSX source files for any import of mock-data,
    // excluding test files (which may reference it as a mocked module name).
    let output = ""
    try {
      output = execSync(
        `grep -r "mock-data" --include="*.ts" --include="*.tsx" \
          --exclude-dir=node_modules \
          --exclude="*.test.ts" --exclude="*.test.tsx" \
          --exclude="*.spec.ts" --exclude="*.spec.tsx" \
          -l .`,
        { cwd: ROOT, encoding: "utf-8" },
      ).trim()
    } catch {
      // grep exits 1 when no matches — that is the success case.
      output = ""
    }

    expect(
      output,
      `These source files still import from mock-data and must be updated:\n${output}`,
    ).toBe("")
  })
})
