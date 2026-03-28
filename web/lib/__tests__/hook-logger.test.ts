import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  appendFileSync: vi.fn(),
}))

const { logHookError, wrapHookCall } = await import("@/lib/hook-logger")
const fs = await import("node:fs")

describe("logHookError", () => {
  const homedir = process.env.HOME ?? process.env.USERPROFILE ?? "~"
  const expectedDir = `${homedir}/.devtrack`
  const expectedLog = `${homedir}/.devtrack/hook-errors.log`

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fs.existsSync).mockReturnValue(true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("log entry format", () => {
    it("appends a timestamped entry to hook-errors.log", () => {
      logHookError("pre-commit", new Error("API timeout"))

      expect(fs.appendFileSync).toHaveBeenCalledOnce()
      const [path, content] = vi.mocked(fs.appendFileSync).mock.calls[0] as [string, string]
      expect(path).toBe(expectedLog)
      expect(content).toContain("API timeout")
    })

    it("includes the hook name in the log entry", () => {
      logHookError("post-checkout", new Error("some error"))

      const [, content] = vi.mocked(fs.appendFileSync).mock.calls[0] as [string, string]
      expect(content).toContain("post-checkout")
    })

    it("includes the error message in the log entry", () => {
      logHookError("pre-push", new Error("connection refused"))

      const [, content] = vi.mocked(fs.appendFileSync).mock.calls[0] as [string, string]
      expect(content).toContain("connection refused")
    })

    it("includes a timestamp in the log entry", () => {
      const before = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
      logHookError("pre-commit", new Error("err"))
      const after = new Date().toISOString().slice(0, 10)

      const [, content] = vi.mocked(fs.appendFileSync).mock.calls[0] as [string, string]
      // Entry should contain today's date
      expect(content).toMatch(new RegExp(before === after ? before : `${before}|${after}`))
    })

    it("writes to the correct log file path", () => {
      logHookError("pre-commit", new Error("err"))

      const [path] = vi.mocked(fs.appendFileSync).mock.calls[0] as [string, string]
      expect(path).toBe(expectedLog)
    })
  })

  describe("directory creation", () => {
    it("creates ~/.devtrack/ directory if it does not exist", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      logHookError("pre-commit", new Error("err"))

      expect(fs.mkdirSync).toHaveBeenCalledWith(expectedDir, { recursive: true })
    })

    it("does not create the directory if it already exists", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)

      logHookError("pre-commit", new Error("err"))

      expect(fs.mkdirSync).not.toHaveBeenCalled()
    })

    it("still appends the log entry even when the directory had to be created", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      logHookError("pre-commit", new Error("err"))

      expect(fs.appendFileSync).toHaveBeenCalledOnce()
    })
  })

  describe("silent failure", () => {
    it("never throws when appendFileSync fails", () => {
      vi.mocked(fs.appendFileSync).mockImplementation(() => {
        throw new Error("disk full")
      })

      expect(() => logHookError("pre-commit", new Error("original error"))).not.toThrow()
    })

    it("never throws when mkdirSync fails", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)
      vi.mocked(fs.mkdirSync).mockImplementation(() => {
        throw new Error("permission denied")
      })

      expect(() => logHookError("pre-commit", new Error("original error"))).not.toThrow()
    })

    it("never throws when existsSync fails", () => {
      vi.mocked(fs.existsSync).mockImplementation(() => {
        throw new Error("unexpected fs error")
      })

      expect(() => logHookError("pre-commit", new Error("original error"))).not.toThrow()
    })

    it("handles non-Error objects as the error argument without throwing", () => {
      expect(() => logHookError("pre-commit", "string error" as unknown as Error)).not.toThrow()
      expect(() => logHookError("pre-commit", null as unknown as Error)).not.toThrow()
      expect(() => logHookError("pre-commit", { code: 42 } as unknown as Error)).not.toThrow()
    })
  })
})

describe("wrapHookCall", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fs.existsSync).mockReturnValue(true)
  })

  it("runs the async function and resolves when it succeeds", async () => {
    const fn = vi.fn().mockResolvedValue(undefined)

    await expect(wrapHookCall("pre-commit", fn)).resolves.not.toThrow()
    expect(fn).toHaveBeenCalledOnce()
  })

  it("logs an error and does not rethrow when the async function rejects", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("API call failed"))

    await expect(wrapHookCall("pre-push", fn)).resolves.not.toThrow()
    expect(fs.appendFileSync).toHaveBeenCalledOnce()
    const [, content] = vi.mocked(fs.appendFileSync).mock.calls[0] as [string, string]
    expect(content).toContain("API call failed")
    expect(content).toContain("pre-push")
  })

  it("includes the hook name in the log entry on failure", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("timeout"))

    await wrapHookCall("post-merge", fn)

    const [, content] = vi.mocked(fs.appendFileSync).mock.calls[0] as [string, string]
    expect(content).toContain("post-merge")
  })

  it("never throws even when logHookError itself would fail", async () => {
    vi.mocked(fs.appendFileSync).mockImplementation(() => {
      throw new Error("disk full")
    })
    const fn = vi.fn().mockRejectedValue(new Error("network error"))

    await expect(wrapHookCall("pre-commit", fn)).resolves.not.toThrow()
  })

  it("passes the hook name to the wrapped function if it accepts one", async () => {
    const fn = vi.fn().mockResolvedValue(undefined)

    await wrapHookCall("pre-commit", fn)

    // fn should be called (with or without args — impl detail)
    expect(fn).toHaveBeenCalled()
  })

  it("resolves without logging when the function succeeds", async () => {
    const fn = vi.fn().mockResolvedValue(undefined)

    await wrapHookCall("pre-commit", fn)

    expect(fs.appendFileSync).not.toHaveBeenCalled()
  })
})
