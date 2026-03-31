import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { CliConfig } from "@/types/cli-config"

// Mock the fs module for config file reading
vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}))

// Mock js-yaml for YAML parsing
vi.mock("js-yaml", () => ({
  load: vi.fn(),
}))

// Import after mocking
const { loadCliConfig } = await import("@/lib/cli-config")
const fs = await import("node:fs")
const yaml = await import("js-yaml")

describe("loadCliConfig", () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    vi.clearAllMocks()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe("environment variables", () => {
    it("returns config from env vars when both are set", () => {
      process.env.DEVTRACK_API_URL = "https://devtrack.example.com"
      process.env.DEVTRACK_API_KEY = "secret-key-123"

      const config: CliConfig = loadCliConfig()

      expect(config.apiUrl).toBe("https://devtrack.example.com")
      expect(config.apiKey).toBe("secret-key-123")
    })

    it("env vars take precedence over config file", () => {
      process.env.DEVTRACK_API_URL = "https://env.example.com"
      process.env.DEVTRACK_API_KEY = "env-key"

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(
        "api_url: https://file.example.com\napi_key: file-key",
      )
      vi.mocked(yaml.load).mockReturnValue({
        api_url: "https://file.example.com",
        api_key: "file-key",
      })

      const config: CliConfig = loadCliConfig()

      expect(config.apiUrl).toBe("https://env.example.com")
      expect(config.apiKey).toBe("env-key")
    })

    it("env var overrides only the fields it provides (partial override)", () => {
      process.env.DEVTRACK_API_URL = "https://env.example.com"
      delete process.env.DEVTRACK_API_KEY

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(
        "api_url: https://file.example.com\napi_key: file-key",
      )
      vi.mocked(yaml.load).mockReturnValue({
        api_url: "https://file.example.com",
        api_key: "file-key",
      })

      const config: CliConfig = loadCliConfig()

      expect(config.apiUrl).toBe("https://env.example.com")
      expect(config.apiKey).toBe("file-key")
    })
  })

  describe("config file fallback", () => {
    beforeEach(() => {
      delete process.env.DEVTRACK_API_URL
      delete process.env.DEVTRACK_API_KEY
    })

    it("reads api_url and api_key from ~/.devtrack/config.yaml", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(
        "api_url: https://file.example.com\napi_key: file-key-456",
      )
      vi.mocked(yaml.load).mockReturnValue({
        api_url: "https://file.example.com",
        api_key: "file-key-456",
      })

      const config: CliConfig = loadCliConfig()

      expect(config.apiUrl).toBe("https://file.example.com")
      expect(config.apiKey).toBe("file-key-456")
    })

    it("reads config from the correct path (~/.devtrack/config.yaml)", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue("")
      vi.mocked(yaml.load).mockReturnValue({
        api_url: "https://file.example.com",
        api_key: "file-key",
      })

      loadCliConfig()

      const homedir = process.env.HOME ?? process.env.USERPROFILE ?? "~"
      expect(fs.existsSync).toHaveBeenCalledWith(`${homedir}/.devtrack/config.yaml`)
    })

    it("skips config file when it does not exist", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      expect(() => loadCliConfig()).toThrow()
      expect(fs.readFileSync).not.toHaveBeenCalled()
    })
  })

  describe("error handling", () => {
    beforeEach(() => {
      delete process.env.DEVTRACK_API_URL
      delete process.env.DEVTRACK_API_KEY
    })

    it("throws a descriptive error when no source provides apiUrl", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue("")
      vi.mocked(yaml.load).mockReturnValue({ api_key: "some-key" })

      expect(() => loadCliConfig()).toThrow(/DEVTRACK_API_URL/)
    })

    it("throws a descriptive error when no source provides apiKey", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue("")
      vi.mocked(yaml.load).mockReturnValue({ api_url: "https://example.com" })

      expect(() => loadCliConfig()).toThrow(/DEVTRACK_API_KEY/)
    })

    it("throws when config file is missing and env vars are absent", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      expect(() => loadCliConfig()).toThrow(/DEVTRACK_API_URL|config/)
    })

    it("throws when config file exists but has no relevant fields", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue("")
      vi.mocked(yaml.load).mockReturnValue({})

      expect(() => loadCliConfig()).toThrow()
    })

    it("throws when config file YAML is malformed", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(": invalid: yaml: [")
      vi.mocked(yaml.load).mockImplementation(() => {
        throw new Error("YAML parse error")
      })

      expect(() => loadCliConfig()).toThrow(/config.*yaml|YAML/i)
    })
  })

  describe("return type", () => {
    it("returns an object with apiUrl and apiKey string properties", () => {
      process.env.DEVTRACK_API_URL = "https://devtrack.example.com"
      process.env.DEVTRACK_API_KEY = "my-api-key"

      const config = loadCliConfig()

      expect(typeof config.apiUrl).toBe("string")
      expect(typeof config.apiKey).toBe("string")
      expect(Object.keys(config)).toEqual(expect.arrayContaining(["apiUrl", "apiKey"]))
    })
  })
})
