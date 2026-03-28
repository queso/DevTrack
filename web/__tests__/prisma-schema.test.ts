import { execSync } from "node:child_process"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const SCHEMA_PATH = join(process.cwd(), "prisma", "schema.prisma")

describe("Prisma schema smoke tests", () => {
  it("should have a schema.prisma file", () => {
    expect(existsSync(SCHEMA_PATH)).toBe(true)
  })

  it.skip("should pass prisma validate", () => {
    let error: unknown
    try {
      execSync("npx prisma validate --schema=prisma/schema.prisma", {
        encoding: "utf-8",
        cwd: process.cwd(),
      })
    } catch (e) {
      error = e
    }
    expect(error).toBeUndefined()
  })

  it("should define all required models", () => {
    const { readFileSync } = require("node:fs")
    const schema = readFileSync(SCHEMA_PATH, "utf-8")
    const requiredModels = ["Project", "Prd", "WorkItem", "Branch", "PullRequest", "Event"]
    for (const model of requiredModels) {
      expect(schema, `Expected model "${model}" to be defined`).toMatch(
        new RegExp(`model\\s+${model}\\s*\\{`),
      )
    }
  })
})
