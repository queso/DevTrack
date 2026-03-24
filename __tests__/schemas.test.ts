import { describe, expect, it } from "vitest"

describe("Zod validation schemas barrel exports", () => {
  it("should export all resource schemas", async () => {
    const schemas = await import("@/lib/schemas/index")

    const expectedExports = [
      // Project
      "createProjectSchema",
      "updateProjectSchema",
      "projectResponseSchema",
      "projectListQuerySchema",
      // Prd
      "createPrdSchema",
      "updatePrdSchema",
      "prdResponseSchema",
      // WorkItem
      "createWorkItemSchema",
      "updateWorkItemSchema",
      "workItemResponseSchema",
      // Branch
      "createBranchSchema",
      "updateBranchSchema",
      "branchResponseSchema",
      // PullRequest
      "createPrSchema",
      "updatePrSchema",
      "prResponseSchema",
      "prListQuerySchema",
      // Event
      "createEventSchema",
      "eventResponseSchema",
      "eventListQuerySchema",
      "eventSummaryResponseSchema",
      // Shared
      "paginationQuerySchema",
      "uuidParamSchema",
      "envelopeSchema",
    ]

    for (const name of expectedExports) {
      expect(schemas, `Expected export "${name}"`).toHaveProperty(name)
    }
  })

  it("should have valid Zod schemas with parse/safeParse methods", async () => {
    const schemas = await import("@/lib/schemas/index")

    const schemaNames = [
      "createProjectSchema",
      "updateProjectSchema",
      "projectResponseSchema",
      "createPrdSchema",
      "createWorkItemSchema",
      "createBranchSchema",
      "createPrSchema",
      "createEventSchema",
      "paginationQuerySchema",
      "uuidParamSchema",
    ]

    for (const name of schemaNames) {
      const schema = schemas[name as keyof typeof schemas]
      expect(typeof (schema as { safeParse?: unknown }).safeParse, `${name} should be a Zod schema`).toBe("function")
    }
  })

  it("should enforce pagination defaults and max constraints", async () => {
    const { paginationQuerySchema } = await import("@/lib/schemas/index")

    // Defaults
    const defaults = paginationQuerySchema.parse({})
    expect(defaults).toMatchObject({ page: 1, per_page: 20 })

    // Max per_page
    const tooMany = paginationQuerySchema.safeParse({ per_page: 101 })
    expect(tooMany.success).toBe(false)
  })
})
