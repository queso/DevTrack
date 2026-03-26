import { describe, expect, it } from "vitest"
import type { ManifestConfig } from "@/types/manifest"

const { parseManifest } = await import("@/lib/manifest")

describe("parseManifest", () => {
  const minimalValid = `
name: my-project
workflow: sdlc
domain: backend
owner: team-platform
`.trim()

  const fullSdlc = `
name: my-project
workflow: sdlc
domain: backend
owner: team-platform
tags:
  - typescript
  - api
main_branch: main
branch_prefix: feat/
prd_path: prd/
test_pattern: "**/__tests__/**/*.test.ts"
deploy:
  environment: production
  url: https://api.example.com
  health_check: /health
`.trim()

  describe("required fields", () => {
    it("parses a minimal valid manifest with all required fields", () => {
      const config: ManifestConfig = parseManifest(minimalValid)

      expect(config.name).toBe("my-project")
      expect(config.workflow).toBe("sdlc")
      expect(config.domain).toBe("backend")
      expect(config.owner).toBe("team-platform")
    })

    it("throws when name is missing", () => {
      const yaml = `
workflow: sdlc
domain: backend
owner: team-platform
`.trim()

      expect(() => parseManifest(yaml)).toThrow(/name/)
    })

    it("throws when domain is missing", () => {
      const yaml = `
name: my-project
workflow: sdlc
owner: team-platform
`.trim()

      expect(() => parseManifest(yaml)).toThrow(/domain/)
    })

    it("throws when owner is missing", () => {
      const yaml = `
name: my-project
workflow: sdlc
domain: backend
`.trim()

      expect(() => parseManifest(yaml)).toThrow(/owner/)
    })
  })

  describe("workflow field validation", () => {
    it("accepts 'sdlc' as a valid workflow value", () => {
      const config = parseManifest(minimalValid)
      expect(config.workflow).toBe("sdlc")
    })

    it("throws for an invalid workflow value", () => {
      const yaml = `
name: my-project
workflow: invalid-workflow
domain: backend
owner: team-platform
`.trim()

      expect(() => parseManifest(yaml)).toThrow()
    })
  })

  describe("optional SDLC fields", () => {
    it("parses a full SDLC manifest with all optional fields", () => {
      const config = parseManifest(fullSdlc)

      expect(config.tags).toEqual(["typescript", "api"])
      expect(config.main_branch).toBe("main")
      expect(config.branch_prefix).toBe("feat/")
      expect(config.prd_path).toBe("prd/")
      expect(config.test_pattern).toBe("**/__tests__/**/*.test.ts")
    })

    it("parses deploy block with environment, url, and health_check", () => {
      const config = parseManifest(fullSdlc)

      expect(config.deploy).toBeDefined()
      expect(config.deploy?.environment).toBe("production")
      expect(config.deploy?.url).toBe("https://api.example.com")
      expect(config.deploy?.health_check).toBe("/health")
    })

    it("parses deploy block without optional health_check", () => {
      const yaml = `
name: my-project
workflow: sdlc
domain: backend
owner: team-platform
deploy:
  environment: staging
  url: https://staging.example.com
`.trim()

      const config = parseManifest(yaml)
      expect(config.deploy?.environment).toBe("staging")
      expect(config.deploy?.url).toBe("https://staging.example.com")
      expect(config.deploy?.health_check).toBeUndefined()
    })

    it("throws when deploy block is missing required environment field", () => {
      const yaml = `
name: my-project
workflow: sdlc
domain: backend
owner: team-platform
deploy:
  url: https://example.com
`.trim()

      expect(() => parseManifest(yaml)).toThrow(/environment/)
    })

    it("throws when deploy block is missing required url field", () => {
      const yaml = `
name: my-project
workflow: sdlc
domain: backend
owner: team-platform
deploy:
  environment: production
`.trim()

      expect(() => parseManifest(yaml)).toThrow(/url/)
    })

    it("omits optional fields when not provided", () => {
      const config = parseManifest(minimalValid)

      expect(config.tags).toBeUndefined()
      expect(config.main_branch).toBeUndefined()
      expect(config.branch_prefix).toBeUndefined()
      expect(config.prd_path).toBeUndefined()
      expect(config.test_pattern).toBeUndefined()
      expect(config.deploy).toBeUndefined()
    })
  })

  describe("invalid YAML", () => {
    it("throws a descriptive error for malformed YAML", () => {
      expect(() => parseManifest(": invalid: yaml: [unclosed")).toThrow()
    })

    it("throws a descriptive error for empty input", () => {
      expect(() => parseManifest("")).toThrow()
    })

    it("throws a descriptive error for YAML that is not an object", () => {
      expect(() => parseManifest("- just\n- a\n- list")).toThrow()
    })
  })

  describe("return type", () => {
    it("returns a typed ManifestConfig object", () => {
      const config = parseManifest(minimalValid)

      expect(typeof config.name).toBe("string")
      expect(typeof config.workflow).toBe("string")
      expect(typeof config.domain).toBe("string")
      expect(typeof config.owner).toBe("string")
    })
  })
})
