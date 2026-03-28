import { describe, expect, it } from "vitest"
import { getSecurityHeaders } from "@/lib/security-headers"

type SecurityHeader = { key: string; value: string }

function findHeader(headers: SecurityHeader[], key: string): string {
  const header = headers.find((h) => h.key === key)
  if (!header) {
    throw new Error(`Header "${key}" not found`)
  }
  return header.value
}

describe("getSecurityHeaders", () => {
  it("should return all 5 base security headers in non-production", () => {
    const headers = getSecurityHeaders("development")
    const keys = headers.map((h) => h.key)

    expect(keys).toContain("Content-Security-Policy")
    expect(keys).not.toContain("Strict-Transport-Security")
    expect(keys).toContain("X-Frame-Options")
    expect(keys).toContain("X-Content-Type-Options")
    expect(keys).toContain("Referrer-Policy")
    expect(keys).toContain("Permissions-Policy")
    expect(headers).toHaveLength(5)
  })

  it("should return all 6 security headers including HSTS in production", () => {
    const headers = getSecurityHeaders("production")
    const keys = headers.map((h) => h.key)

    expect(keys).toContain("Content-Security-Policy")
    expect(keys).toContain("Strict-Transport-Security")
    expect(keys).toContain("X-Frame-Options")
    expect(keys).toContain("X-Content-Type-Options")
    expect(keys).toContain("Referrer-Policy")
    expect(keys).toContain("Permissions-Policy")
    expect(headers).toHaveLength(6)
  })

  describe("Content-Security-Policy", () => {
    it("should allow unsafe-inline for style-src to support Tailwind CSS", () => {
      const csp = findHeader(getSecurityHeaders(), "Content-Security-Policy")
      expect(csp).toMatch(/style-src\s+'self'\s+'unsafe-inline'/)
    })

    it("should exclude unsafe-eval from script-src in production", () => {
      const csp = findHeader(getSecurityHeaders("production"), "Content-Security-Policy")
      const scriptSrc = csp.match(/script-src([^;]*)/)?.[1] ?? ""
      expect(scriptSrc).not.toContain("'unsafe-eval'")
    })

    it("should include unsafe-eval in script-src in development", () => {
      const csp = findHeader(getSecurityHeaders("development"), "Content-Security-Policy")
      expect(csp).toMatch(/script-src\s+'self'\s+'unsafe-eval'/)
    })

    it("should not include unsafe-inline or unsafe-eval in script-src in production", () => {
      const csp = findHeader(getSecurityHeaders("production"), "Content-Security-Policy")
      const scriptSrc = csp.match(/script-src([^;]*)/)?.[1] ?? ""

      // Production should not have dangerous directives for scripts
      expect(scriptSrc).not.toContain("'unsafe-inline'")
      expect(scriptSrc).not.toContain("'unsafe-eval'")

      // But should allow self
      expect(scriptSrc).toContain("'self'")
    })
  })

  describe("other security headers", () => {
    const headers = getSecurityHeaders()

    it("should set HSTS with max-age, includeSubDomains, and preload in production", () => {
      const prodHeaders = getSecurityHeaders("production")
      const hsts = findHeader(prodHeaders, "Strict-Transport-Security")
      expect(hsts).toBe("max-age=63072000; includeSubDomains; preload")
    })

    it("should not include HSTS in non-production environments", () => {
      const devHeaders = getSecurityHeaders("development")
      const keys = devHeaders.map((h) => h.key)
      expect(keys).not.toContain("Strict-Transport-Security")
    })

    it("should set X-Frame-Options to DENY", () => {
      expect(findHeader(headers, "X-Frame-Options")).toBe("DENY")
    })

    it("should set X-Content-Type-Options to nosniff", () => {
      expect(findHeader(headers, "X-Content-Type-Options")).toBe("nosniff")
    })

    it("should set Referrer-Policy to strict-origin-when-cross-origin", () => {
      expect(findHeader(headers, "Referrer-Policy")).toBe("strict-origin-when-cross-origin")
    })

    it("should disable camera, microphone, and geolocation in Permissions-Policy", () => {
      const policy = findHeader(headers, "Permissions-Policy")
      expect(policy).toContain("camera=()")
      expect(policy).toContain("microphone=()")
      expect(policy).toContain("geolocation=()")
    })
  })
})
