import * as nextCache from "next/cache"
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest"
import { cacheHeaders, revalidateByTag, revalidatePath } from "@/lib/cache"
import * as logger from "@/lib/logger"

// Mock next/cache
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}))

// Mock logger
vi.mock("@/lib/logger", () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}))

describe("revalidateByTag", () => {
  let mockRevalidateTag: Mock

  beforeEach(() => {
    vi.clearAllMocks()
    mockRevalidateTag = vi.fn()
    ;(nextCache.revalidateTag as Mock).mockImplementation(mockRevalidateTag)
    ;(logger.getLogger as Mock).mockReturnValue({
      info: vi.fn(),
      error: vi.fn(),
    })
  })

  it("should call Next.js revalidateTag with the provided tag", () => {
    revalidateByTag("posts")
    expect(mockRevalidateTag).toHaveBeenCalledWith("posts", "default")
  })
})

describe("revalidatePath", () => {
  let mockRevalidatePath: Mock

  beforeEach(() => {
    vi.clearAllMocks()
    mockRevalidatePath = vi.fn()
    ;(nextCache.revalidatePath as Mock).mockImplementation(mockRevalidatePath)
    ;(logger.getLogger as Mock).mockReturnValue({
      info: vi.fn(),
      error: vi.fn(),
    })
  })

  it("should call Next.js revalidatePath with path only", () => {
    revalidatePath("/posts")
    expect(mockRevalidatePath).toHaveBeenCalledWith("/posts", undefined)
  })

  it("should call Next.js revalidatePath with path and type", () => {
    revalidatePath("/dashboard", "page")
    expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard", "page")
  })
})

describe("cacheHeaders", () => {
  describe("defaults and noStore", () => {
    it("should return no-store by default when called with no arguments", () => {
      expect(cacheHeaders()).toBe("no-store")
    })

    it("should return no-store when called with empty options", () => {
      expect(cacheHeaders({})).toBe("no-store")
    })

    it("noStore takes precedence over all other options", () => {
      const headers = cacheHeaders({
        noStore: true,
        maxAge: 3600,
        staleWhileRevalidate: 86400,
        isPublic: true,
      })
      expect(headers).toBe("no-store")
    })
  })

  describe("maxAge", () => {
    it("should set max-age directive", () => {
      expect(cacheHeaders({ maxAge: 3600 })).toBe("private, max-age=3600")
    })

    it("should handle maxAge=0", () => {
      expect(cacheHeaders({ maxAge: 0 })).toBe("private, max-age=0")
    })
  })

  describe("staleWhileRevalidate", () => {
    it("should set stale-while-revalidate directive", () => {
      expect(cacheHeaders({ staleWhileRevalidate: 86400 })).toBe(
        "private, stale-while-revalidate=86400",
      )
    })

    it("should handle staleWhileRevalidate=0", () => {
      expect(cacheHeaders({ staleWhileRevalidate: 0 })).toBe(
        "private, stale-while-revalidate=0",
      )
    })
  })

  describe("isPublic flag", () => {
    it("should default to private when isPublic is not set", () => {
      expect(cacheHeaders({ maxAge: 3600 })).toMatch(/^private/)
    })

    it("should use public when isPublic is true", () => {
      expect(cacheHeaders({ maxAge: 3600, isPublic: true })).toMatch(/^public/)
    })

    it("should use private when isPublic is false", () => {
      expect(cacheHeaders({ maxAge: 3600, isPublic: false })).toMatch(/^private/)
    })
  })

  describe("combined options", () => {
    it("should combine maxAge and staleWhileRevalidate", () => {
      const headers = cacheHeaders({
        maxAge: 3600,
        staleWhileRevalidate: 86400,
      })
      expect(headers).toBe("private, max-age=3600, stale-while-revalidate=86400")
    })

    it("should create complete header with all options", () => {
      const headers = cacheHeaders({
        maxAge: 3600,
        staleWhileRevalidate: 86400,
        isPublic: true,
      })
      expect(headers).toBe("public, max-age=3600, stale-while-revalidate=86400")
    })
  })
})
