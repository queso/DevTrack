import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ApiErrorResponse } from "@/lib/api"
import { fetcher, mutationFetcher } from "@/lib/fetcher"

describe("fetcher (updated with optional headers)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("should fetch data without headers (existing behavior)", async () => {
    const mockData = { id: 1, name: "Test" }
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockData,
    })

    const result = await fetcher<typeof mockData>("/api/test")

    expect(fetch).toHaveBeenCalledWith("/api/test")
    expect(result).toEqual(mockData)
  })

  it("should fetch data with custom headers", async () => {
    const mockData = { id: 1, name: "Test" }
    const customHeaders = {
      "X-Custom-Header": "value",
      Authorization: "Bearer token",
    }
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockData,
    })

    const result = await fetcher<typeof mockData>("/api/test", customHeaders)

    expect(fetch).toHaveBeenCalledWith("/api/test", { headers: customHeaders })
    expect(result).toEqual(mockData)
  })

  it("should fetch data with correlation ID header", async () => {
    const mockData = { id: 1, name: "Test" }
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockData,
    })

    await fetcher("/api/test", { "X-Correlation-Id": "abc-123" })

    expect(fetch).toHaveBeenCalledWith("/api/test", {
      headers: { "X-Correlation-Id": "abc-123" },
    })
  })

  it("should throw error with status on non-OK response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    })

    await expect(fetcher("/api/test")).rejects.toThrow("Fetch failed")
    await expect(fetcher("/api/test")).rejects.toHaveProperty("status", 404)
  })

  it("should preserve existing error handling behavior", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    })

    try {
      await fetcher("/api/test")
      expect.fail("Should have thrown")
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      expect((error as Error & { status: number }).status).toBe(500)
    }
  })
})

describe("mutationFetcher", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("should default to POST method when not specified", async () => {
    const mockData = { id: 1, created: true }
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockData,
    })

    await mutationFetcher("/api/users", { arg: { body: { name: "John" } } })

    expect(fetch).toHaveBeenCalledWith(
      "/api/users",
      expect.objectContaining({
        method: "POST",
      }),
    )
  })

  it("should use specified HTTP method (POST)", async () => {
    const mockData = { success: true }
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockData,
    })

    await mutationFetcher("/api/users", {
      arg: { method: "POST", body: { name: "John" } },
    })

    expect(fetch).toHaveBeenCalledWith(
      "/api/users",
      expect.objectContaining({
        method: "POST",
      }),
    )
  })

  it("should use specified HTTP method (PUT)", async () => {
    const mockData = { id: 1, updated: true }
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockData,
    })

    await mutationFetcher("/api/users/1", {
      arg: { method: "PUT", body: { name: "Jane" } },
    })

    expect(fetch).toHaveBeenCalledWith(
      "/api/users/1",
      expect.objectContaining({
        method: "PUT",
      }),
    )
  })

  it("should use specified HTTP method (PATCH)", async () => {
    const mockData = { id: 1, updated: true }
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockData,
    })

    await mutationFetcher("/api/users/1", {
      arg: { method: "PATCH", body: { name: "Jane" } },
    })

    expect(fetch).toHaveBeenCalledWith(
      "/api/users/1",
      expect.objectContaining({
        method: "PATCH",
      }),
    )
  })

  it("should use specified HTTP method (DELETE)", async () => {
    const mockData = { success: true }
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockData,
    })

    await mutationFetcher("/api/users/1", {
      arg: { method: "DELETE" },
    })

    expect(fetch).toHaveBeenCalledWith(
      "/api/users/1",
      expect.objectContaining({
        method: "DELETE",
      }),
    )
  })

  it("should set Content-Type to application/json", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })

    await mutationFetcher("/api/users", {
      arg: { body: { name: "John" } },
    })

    expect(fetch).toHaveBeenCalledWith(
      "/api/users",
      expect.objectContaining({
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      }),
    )
  })

  it("should JSON-stringify the body", async () => {
    const body = { name: "John", age: 30 }
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })

    await mutationFetcher("/api/users", { arg: { body } })

    expect(fetch).toHaveBeenCalledWith(
      "/api/users",
      expect.objectContaining({
        body: JSON.stringify(body),
      }),
    )
  })

  it("should handle requests without body (DELETE)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    })

    await mutationFetcher("/api/users/1", { arg: { method: "DELETE" } })

    expect(fetch).toHaveBeenCalledWith(
      "/api/users/1",
      expect.objectContaining({
        method: "DELETE",
      }),
    )
  })

  it("should return parsed JSON on success", async () => {
    const mockData = { id: 1, name: "John", created: true }
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockData,
    })

    const result = await mutationFetcher<typeof mockData>("/api/users", {
      arg: { body: { name: "John" } },
    })

    expect(result).toEqual(mockData)
  })

  it("should include X-Correlation-Id header when correlationId is provided", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })

    await mutationFetcher("/api/users", {
      arg: {
        body: { name: "John" },
        headers: { "X-Correlation-Id": "abc-123" },
      },
    })

    expect(fetch).toHaveBeenCalledWith(
      "/api/users",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Correlation-Id": "abc-123",
        }),
      }),
    )
  })

  it("should merge custom headers with Content-Type", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })

    await mutationFetcher("/api/users", {
      arg: {
        body: { name: "John" },
        headers: {
          "X-Custom-Header": "value",
          Authorization: "Bearer token",
        },
      },
    })

    expect(fetch).toHaveBeenCalledWith(
      "/api/users",
      expect.objectContaining({
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-Custom-Header": "value",
          Authorization: "Bearer token",
        }),
      }),
    )
  })

  it("should throw error with parsed error body on non-OK response", async () => {
    const errorBody: ApiErrorResponse = {
      error: "BAD_REQUEST",
      message: "Invalid input",
      details: { field: "email" },
    }
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => errorBody,
    })

    try {
      await mutationFetcher("/api/users", { arg: { body: { name: "" } } })
      expect.fail("Should have thrown")
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      const err = error as Error & { status: number; body: ApiErrorResponse }
      expect(err.status).toBe(400)
      expect(err.body).toEqual(errorBody)
    }
  })

  it("should attach ApiErrorResponse shape to thrown error", async () => {
    const errorBody: ApiErrorResponse = {
      error: "NOT_FOUND",
      message: "User not found",
    }
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => errorBody,
    })

    await expect(
      mutationFetcher("/api/users/999", { arg: { method: "PUT", body: {} } }),
    ).rejects.toMatchObject({
      status: 404,
      body: errorBody,
    })
  })

  it("should provide fallback error body when server returns non-JSON error response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new SyntaxError("Unexpected token '<'")
      },
    })

    try {
      await mutationFetcher("/api/users", { arg: { body: { name: "John" } } })
      expect.fail("Should have thrown")
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      const err = error as Error & { status: number; body: ApiErrorResponse }
      expect(err.status).toBe(502)
      expect(err.body).toEqual({
        error: "UNKNOWN_ERROR",
        message: "The server returned a non-JSON error response",
      })
      expect(err.message).toBe("The server returned a non-JSON error response")
    }
  })

  it("should handle 500 errors with correlationId in error body", async () => {
    const errorBody: ApiErrorResponse = {
      error: "INTERNAL_SERVER_ERROR",
      message: "Database error",
      correlationId: "xyz-789",
    }
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => errorBody,
    })

    try {
      await mutationFetcher("/api/users", { arg: { body: {} } })
      expect.fail("Should have thrown")
    } catch (error) {
      const err = error as Error & { status: number; body: ApiErrorResponse }
      expect(err.body.correlationId).toBe("xyz-789")
    }
  })

  it("should match useSWRMutation fetcher signature", async () => {
    // useSWRMutation calls fetcher with (url, { arg })
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    })

    // This should match how useSWRMutation calls the fetcher
    const url = "/api/users"
    const options = { arg: { body: { name: "John" } } }

    const result = await mutationFetcher(url, options)

    expect(result).toEqual({ success: true })
  })

  it("should handle empty arg object", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    })

    await mutationFetcher("/api/test", { arg: {} })

    expect(fetch).toHaveBeenCalledWith(
      "/api/test",
      expect.objectContaining({
        method: "POST",
      }),
    )
  })

  it("should handle complex nested body objects", async () => {
    const complexBody = {
      user: {
        name: "John",
        profile: {
          age: 30,
          tags: ["developer", "tester"],
        },
      },
      metadata: {
        source: "web",
      },
    }
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 1 }),
    })

    await mutationFetcher("/api/users", { arg: { body: complexBody } })

    expect(fetch).toHaveBeenCalledWith(
      "/api/users",
      expect.objectContaining({
        body: JSON.stringify(complexBody),
      }),
    )
  })
})

describe("integration: fetcher and mutationFetcher", () => {
  it("should use fetcher for reads and mutationFetcher for writes", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: "test" }),
    })

    // Read with fetcher
    await fetcher("/api/users")
    expect(fetch).toHaveBeenLastCalledWith("/api/users")

    // Write with mutationFetcher
    await mutationFetcher("/api/users", { arg: { body: { name: "John" } } })
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/users",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      }),
    )
  })

  it("fetcher and mutationFetcher should both support correlation IDs", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })

    // Fetcher with correlation ID
    await fetcher("/api/users", { "X-Correlation-Id": "read-123" })
    expect(fetch).toHaveBeenLastCalledWith("/api/users", {
      headers: { "X-Correlation-Id": "read-123" },
    })

    // mutationFetcher with correlation ID
    await mutationFetcher("/api/users", {
      arg: {
        body: {},
        headers: { "X-Correlation-Id": "write-123" },
      },
    })
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/users",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Correlation-Id": "write-123",
        }),
      }),
    )
  })
})
