import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/env", () => ({
  createEnv: () => ({
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    LOG_LEVEL: "info" as const,
    SITE_URL: "https://example.com",
  }),
  getEnv: () => ({
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    LOG_LEVEL: "info" as const,
    SITE_URL: "https://example.com",
  }),
}))

describe("Sitemap", () => {
  it("should return an array of entries with valid URLs", async () => {
    const sitemap = (await import("@/app/sitemap")).default
    const result = sitemap()

    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBeGreaterThanOrEqual(1)

    // Verify first entry is the home page with correct site URL
    expect(result[0]).toHaveProperty("url")
    expect(result[0].url).toBe("https://example.com")
    expect(result[0]).toHaveProperty("lastModified")
    expect(result[0].lastModified).toBeInstanceOf(Date)
  })
})

describe("Robots", () => {
  it("should return rules allowing all user agents and a sitemap URL", async () => {
    const robots = (await import("@/app/robots")).default
    const result = robots()

    expect(result).toHaveProperty("rules")
    expect(result).toHaveProperty("sitemap")

    // Rules should allow all user agents to crawl from root
    const rules: Array<{ userAgent?: string | string[]; allow?: string | string[] }> =
      Array.isArray(result.rules) ? result.rules : [result.rules]
    const allowAllRule = rules.find(
      (rule) =>
        (rule.userAgent === "*" ||
          (Array.isArray(rule.userAgent) && rule.userAgent.includes("*"))) &&
        rule.allow === "/",
    )
    expect(allowAllRule).toBeDefined()
    expect(allowAllRule?.userAgent).toBe("*")
    expect(allowAllRule?.allow).toBe("/")

    // Sitemap should be the correct full URL
    expect(result.sitemap).toBe("https://example.com/sitemap.xml")
  })
})
