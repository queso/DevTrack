import { describe, expect, it } from "vitest"

describe("GET /api/v1/openapi.json", () => {
  it("should return valid OpenAPI 3.1 JSON without authentication", async () => {
    const { GET } = await import("@/app/api/v1/openapi.json/route")
    const request = new Request("http://localhost/api/v1/openapi.json")
    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toContain("application/json")

    const spec = await response.json()
    expect(spec.openapi).toMatch(/^3\.1\./)
    expect(spec).toHaveProperty("info")
    expect(spec).toHaveProperty("paths")
    expect(spec).toHaveProperty("components")
  })

  it("should document all required endpoint paths", async () => {
    const { GET } = await import("@/app/api/v1/openapi.json/route")
    const response = await GET(new Request("http://localhost/api/v1/openapi.json"))
    const spec = await response.json()
    const paths = Object.keys(spec.paths ?? {})

    const required = [
      "/api/health",
      "/api/v1/projects",
      "/api/v1/prds",
      "/api/v1/prs",
      "/api/v1/branches",
      "/api/v1/events",
      "/api/v1/webhooks/github",
    ]

    for (const path of required) {
      expect(
        paths.some((p) => p.startsWith(path)),
        `Expected path "${path}" in spec`,
      ).toBe(true)
    }
  })

  it("should define Bearer security scheme and envelope/error schemas", async () => {
    const { GET } = await import("@/app/api/v1/openapi.json/route")
    const response = await GET(new Request("http://localhost/api/v1/openapi.json"))
    const spec = await response.json()

    // Bearer security scheme
    const schemes = spec.components?.securitySchemes ?? {}
    const hasBearer = Object.values(schemes).some(
      (s: unknown) =>
        (s as { scheme?: string }).scheme === "bearer" || (s as { type?: string }).type === "http",
    )
    expect(hasBearer, "Expected Bearer security scheme").toBe(true)

    // Envelope and error response schemas
    const schemas = spec.components?.schemas ?? {}
    const schemaNames = Object.keys(schemas)
    expect(
      schemaNames.some((n) => /error/i.test(n)),
      "Expected error schema",
    ).toBe(true)
    expect(
      schemaNames.some((n) => /envelope|response|meta/i.test(n)),
      "Expected envelope/meta schema",
    ).toBe(true)
  })
})
