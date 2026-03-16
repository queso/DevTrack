import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { HookInstallResult } from "@/types/hooks"

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  chmodSync: vi.fn(),
  readFileSync: vi.fn(),
}))

const { installHooks } = await import("@/lib/hook-installer")
const fs = await import("node:fs")

const PROJECT_DIR = "/home/user/my-project"
const HOOKS_DIR = `${PROJECT_DIR}/.claude/hooks`
const SETTINGS_PATH = `${PROJECT_DIR}/.claude/settings.json`

describe("installHooks", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fs.existsSync).mockReturnValue(false)
    vi.mocked(fs.readFileSync).mockReturnValue("{}")
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("directory creation", () => {
    it("creates the .claude/hooks/ directory when it does not exist", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      await installHooks({ projectDir: PROJECT_DIR })

      expect(fs.mkdirSync).toHaveBeenCalledWith(HOOKS_DIR, { recursive: true })
    })

    it("does not recreate .claude/hooks/ if it already exists", async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => p === HOOKS_DIR)

      await installHooks({ projectDir: PROJECT_DIR })

      expect(fs.mkdirSync).not.toHaveBeenCalledWith(HOOKS_DIR, expect.anything())
    })
  })

  describe("script generation", () => {
    it("generates all four hook scripts", async () => {
      await installHooks({ projectDir: PROJECT_DIR })

      const writtenFiles = vi.mocked(fs.writeFileSync).mock.calls.map(([p]) => p as string)
      expect(writtenFiles).toContain(`${HOOKS_DIR}/post-commit.sh`)
      expect(writtenFiles).toContain(`${HOOKS_DIR}/post-push.sh`)
      expect(writtenFiles).toContain(`${HOOKS_DIR}/pre-session.sh`)
      expect(writtenFiles).toContain(`${HOOKS_DIR}/post-session.sh`)
    })

    it("each script starts with #!/bin/bash shebang", async () => {
      await installHooks({ projectDir: PROJECT_DIR })

      const scriptCalls = vi.mocked(fs.writeFileSync).mock.calls.filter(([p]) =>
        (p as string).endsWith(".sh"),
      )

      for (const [, content] of scriptCalls) {
        expect(content as string).toMatch(/^#!\/bin\/bash/)
      }
    })

    it("post-commit.sh calls 'devtrack event commit'", async () => {
      await installHooks({ projectDir: PROJECT_DIR })

      const call = vi.mocked(fs.writeFileSync).mock.calls.find(([p]) =>
        (p as string).endsWith("post-commit.sh"),
      )
      expect(call).toBeDefined()
      expect(call?.[1] as string).toContain("devtrack event commit")
    })

    it("post-commit.sh passes branch, hash, and message to the CLI", async () => {
      await installHooks({ projectDir: PROJECT_DIR })

      const call = vi.mocked(fs.writeFileSync).mock.calls.find(([p]) =>
        (p as string).endsWith("post-commit.sh"),
      )
      const content = call?.[1] as string
      // Script should extract and pass branch, commit hash, and message
      expect(content).toMatch(/branch|BRANCH|HEAD/i)
      expect(content).toMatch(/hash|HASH|HEAD/i)
      expect(content).toMatch(/message|MSG|commit.*message/i)
    })

    it("post-push.sh calls 'devtrack event push'", async () => {
      await installHooks({ projectDir: PROJECT_DIR })

      const call = vi.mocked(fs.writeFileSync).mock.calls.find(([p]) =>
        (p as string).endsWith("post-push.sh"),
      )
      expect(call).toBeDefined()
      expect(call?.[1] as string).toContain("devtrack event push")
    })

    it("post-push.sh passes branch and commit count to the CLI", async () => {
      await installHooks({ projectDir: PROJECT_DIR })

      const call = vi.mocked(fs.writeFileSync).mock.calls.find(([p]) =>
        (p as string).endsWith("post-push.sh"),
      )
      const content = call?.[1] as string
      expect(content).toMatch(/branch|BRANCH/i)
      expect(content).toMatch(/count|COUNT|commits/i)
    })

    it("pre-session.sh calls 'devtrack event session-start'", async () => {
      await installHooks({ projectDir: PROJECT_DIR })

      const call = vi.mocked(fs.writeFileSync).mock.calls.find(([p]) =>
        (p as string).endsWith("pre-session.sh"),
      )
      expect(call).toBeDefined()
      expect(call?.[1] as string).toContain("devtrack event session-start")
    })

    it("post-session.sh calls 'devtrack event session-end'", async () => {
      await installHooks({ projectDir: PROJECT_DIR })

      const call = vi.mocked(fs.writeFileSync).mock.calls.find(([p]) =>
        (p as string).endsWith("post-session.sh"),
      )
      expect(call).toBeDefined()
      expect(call?.[1] as string).toContain("devtrack event session-end")
    })

    it("post-session.sh passes duration to the CLI", async () => {
      await installHooks({ projectDir: PROJECT_DIR })

      const call = vi.mocked(fs.writeFileSync).mock.calls.find(([p]) =>
        (p as string).endsWith("post-session.sh"),
      )
      const content = call?.[1] as string
      expect(content).toMatch(/duration|DURATION/i)
    })

    it("scripts read project name from project.yaml", async () => {
      await installHooks({ projectDir: PROJECT_DIR })

      const scriptCalls = vi.mocked(fs.writeFileSync).mock.calls.filter(([p]) =>
        (p as string).endsWith(".sh"),
      )

      for (const [, content] of scriptCalls) {
        expect(content as string).toContain("project.yaml")
      }
    })

    it("scripts use devtrack CLI, not direct HTTP calls", async () => {
      await installHooks({ projectDir: PROJECT_DIR })

      const scriptCalls = vi.mocked(fs.writeFileSync).mock.calls.filter(([p]) =>
        (p as string).endsWith(".sh"),
      )

      for (const [, content] of scriptCalls) {
        expect(content as string).not.toMatch(/curl|wget|fetch|http(s)?:\/\//i)
        expect(content as string).toContain("devtrack")
      }
    })
  })

  describe("file permissions", () => {
    it("makes all four scripts executable (chmod +x)", async () => {
      await installHooks({ projectDir: PROJECT_DIR })

      const chmodCalls = vi.mocked(fs.chmodSync).mock.calls.map(([p]) => p as string)
      expect(chmodCalls).toContain(`${HOOKS_DIR}/post-commit.sh`)
      expect(chmodCalls).toContain(`${HOOKS_DIR}/post-push.sh`)
      expect(chmodCalls).toContain(`${HOOKS_DIR}/pre-session.sh`)
      expect(chmodCalls).toContain(`${HOOKS_DIR}/post-session.sh`)
    })

    it("sets executable permission (0o755 or 0o755-equivalent)", async () => {
      await installHooks({ projectDir: PROJECT_DIR })

      for (const [, mode] of vi.mocked(fs.chmodSync).mock.calls) {
        // Accept octal number or string representation
        expect([0o755, "755", 0o744, "744"]).toContain(mode)
      }
    })
  })

  describe("settings.json update", () => {
    it("creates .claude/settings.json if it does not exist", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      await installHooks({ projectDir: PROJECT_DIR })

      const settingsWrite = vi.mocked(fs.writeFileSync).mock.calls.find(([p]) =>
        (p as string) === SETTINGS_PATH,
      )
      expect(settingsWrite).toBeDefined()
    })

    it("writes valid JSON to .claude/settings.json", async () => {
      await installHooks({ projectDir: PROJECT_DIR })

      const settingsWrite = vi.mocked(fs.writeFileSync).mock.calls.find(([p]) =>
        (p as string) === SETTINGS_PATH,
      )
      expect(() => JSON.parse(settingsWrite?.[1] as string)).not.toThrow()
    })

    it("registers hook entries in settings.json", async () => {
      await installHooks({ projectDir: PROJECT_DIR })

      const settingsWrite = vi.mocked(fs.writeFileSync).mock.calls.find(([p]) =>
        (p as string) === SETTINGS_PATH,
      )
      const settings = JSON.parse(settingsWrite?.[1] as string)
      expect(settings).toHaveProperty("hooks")
    })

    it("merges with existing settings.json content rather than overwriting it", async () => {
      const existing = JSON.stringify({ someOtherKey: "preserve-me" })
      vi.mocked(fs.existsSync).mockImplementation((p) => p === SETTINGS_PATH)
      vi.mocked(fs.readFileSync).mockReturnValue(existing)

      await installHooks({ projectDir: PROJECT_DIR })

      const settingsWrite = vi.mocked(fs.writeFileSync).mock.calls.find(([p]) =>
        (p as string) === SETTINGS_PATH,
      )
      const settings = JSON.parse(settingsWrite?.[1] as string)
      expect(settings.someOtherKey).toBe("preserve-me")
    })

    it("does not duplicate hook registrations on repeated installs", async () => {
      const existingSettings = JSON.stringify({
        hooks: {
          PostToolUse: [
            { matcher: "Bash", hooks: [{ type: "command", command: `${HOOKS_DIR}/post-commit.sh` }] },
          ],
        },
      })
      vi.mocked(fs.existsSync).mockImplementation((p) => p === SETTINGS_PATH || p === HOOKS_DIR)
      vi.mocked(fs.readFileSync).mockReturnValue(existingSettings)

      await installHooks({ projectDir: PROJECT_DIR })

      const settingsWrite = vi.mocked(fs.writeFileSync).mock.calls.find(([p]) =>
        (p as string) === SETTINGS_PATH,
      )
      const settings = JSON.parse(settingsWrite?.[1] as string)
      const postToolUseHooks = settings.hooks?.PostToolUse ?? []
      const commitHooks = postToolUseHooks.filter((h: { hooks: Array<{ command: string }> }) =>
        h.hooks?.some((c) => c.command?.includes("post-commit.sh")),
      )
      expect(commitHooks.length).toBeLessThanOrEqual(1)
    })
  })

  describe("return value", () => {
    it("returns a HookInstallResult with hooksDir, scriptsCreated, and settingsUpdated", async () => {
      const result: HookInstallResult = await installHooks({ projectDir: PROJECT_DIR })

      expect(result).toHaveProperty("hooksDir")
      expect(result).toHaveProperty("scriptsCreated")
      expect(result).toHaveProperty("settingsUpdated")
    })

    it("returns the correct hooksDir path", async () => {
      const result = await installHooks({ projectDir: PROJECT_DIR })

      expect(result.hooksDir).toBe(HOOKS_DIR)
    })

    it("returns all four script names in scriptsCreated", async () => {
      const result = await installHooks({ projectDir: PROJECT_DIR })

      expect(result.scriptsCreated).toContain("post-commit")
      expect(result.scriptsCreated).toContain("post-push")
      expect(result.scriptsCreated).toContain("pre-session")
      expect(result.scriptsCreated).toContain("post-session")
    })

    it("returns settingsUpdated: true when settings.json was written", async () => {
      const result = await installHooks({ projectDir: PROJECT_DIR })

      expect(result.settingsUpdated).toBe(true)
    })
  })

  describe("force flag", () => {
    it("overwrites existing scripts when force: true", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)

      await installHooks({ projectDir: PROJECT_DIR, force: true })

      const scriptWrites = vi.mocked(fs.writeFileSync).mock.calls.filter(([p]) =>
        (p as string).endsWith(".sh"),
      )
      expect(scriptWrites.length).toBe(4)
    })

    it("skips writing scripts that already exist when force is not set", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)

      await installHooks({ projectDir: PROJECT_DIR })

      const scriptWrites = vi.mocked(fs.writeFileSync).mock.calls.filter(([p]) =>
        (p as string).endsWith(".sh"),
      )
      expect(scriptWrites.length).toBe(0)
    })
  })
})
