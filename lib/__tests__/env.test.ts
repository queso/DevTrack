import { describe, expect, it } from "vitest"
import { createEnv } from "@/lib/env"

describe("createEnv", () => {
  const validEnv = {
    DATABASE_URL: "postgresql://user:pass@localhost:5432/mydb",
  }

  describe("happy path", () => {
    it("should return typed env values when all required vars are set", () => {
      const env = createEnv(validEnv)

      expect(env.DATABASE_URL).toBe("postgresql://user:pass@localhost:5432/mydb")
    })

    it("should accept all valid LOG_LEVEL values", () => {
      for (const level of ["debug", "info", "warn", "error"] as const) {
        const env = createEnv({ ...validEnv, LOG_LEVEL: level })
        expect(env.LOG_LEVEL).toBe(level)
      }
    })

    it("should return SITE_URL when explicitly set", () => {
      const env = createEnv({ ...validEnv, SITE_URL: "https://example.com" })
      expect(env.SITE_URL).toBe("https://example.com")
    })

    it("should return CORS_ORIGIN when explicitly set", () => {
      const env = createEnv({ ...validEnv, CORS_ORIGIN: "https://app.example.com" })
      expect(env.CORS_ORIGIN).toBe("https://app.example.com")
    })

    it("should parse RATE_LIMIT_RPM as a number when set as string", () => {
      const env = createEnv({ ...validEnv, RATE_LIMIT_RPM: "120" })
      expect(env.RATE_LIMIT_RPM).toBe(120)
    })
  })

  describe("defaults", () => {
    it("should default LOG_LEVEL to info when not set", () => {
      const env = createEnv(validEnv)
      expect(env.LOG_LEVEL).toBe("info")
    })

    it("should default SITE_URL to http://localhost:3000 when not set", () => {
      const env = createEnv(validEnv)
      expect(env.SITE_URL).toBe("http://localhost:3000")
    })

    it("should default CORS_ORIGIN to empty string when not set", () => {
      const env = createEnv(validEnv)
      expect(env.CORS_ORIGIN).toBe("")
    })

    it("should default RATE_LIMIT_RPM to 60 when not set", () => {
      const env = createEnv(validEnv)
      expect(env.RATE_LIMIT_RPM).toBe(60)
    })
  })

  describe("validation errors", () => {
    it("should throw when DATABASE_URL is missing", () => {
      expect(() => createEnv({})).toThrow(/DATABASE_URL/)
    })

    it("should throw when LOG_LEVEL is an invalid value", () => {
      expect(() => createEnv({ ...validEnv, LOG_LEVEL: "verbose" })).toThrow()
    })

    it("should throw when RATE_LIMIT_RPM is not a valid positive integer", () => {
      expect(() => createEnv({ ...validEnv, RATE_LIMIT_RPM: "-10" })).toThrow()
      expect(() => createEnv({ ...validEnv, RATE_LIMIT_RPM: "0" })).toThrow()
      expect(() => createEnv({ ...validEnv, RATE_LIMIT_RPM: "abc" })).toThrow()
    })
  })
})
