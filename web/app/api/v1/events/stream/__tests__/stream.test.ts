/**
 * Tests for GET /api/v1/events/stream (SSE probe endpoint).
 *
 * Acceptance criteria:
 * 1. Unauthenticated requests are rejected (delegates to authenticateRequest).
 * 2. Authenticated requests return a text/event-stream response with the
 *    no-buffer headers the edge needs.
 * 3. The stream opens immediately (comment prelude) and emits tick events.
 * 4. Aborting the request tears the stream down (no leaked interval).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { GET } from "../route"

vi.mock("@/lib/logger", () => ({
  getLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() })),
}))

const authenticateRequest = vi.fn()
vi.mock("@/lib/auth", () => ({
  authenticateRequest: (req: Request) => authenticateRequest(req),
}))

describe("GET /api/v1/events/stream", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("rejects unauthenticated requests", async () => {
    const rejection = new Response("nope", { status: 401 })
    authenticateRequest.mockResolvedValue({ success: false, response: rejection })

    const res = await GET(new Request("http://localhost/api/v1/events/stream"))

    expect(res.status).toBe(401)
    expect(res.headers.get("Content-Type")).not.toBe("text/event-stream")
  })

  it("returns an event-stream with no-buffer headers when authenticated", async () => {
    authenticateRequest.mockResolvedValue({ success: true, data: { authenticated: true } })

    const controller = new AbortController()
    const res = await GET(
      new Request("http://localhost/api/v1/events/stream", { signal: controller.signal }),
    )

    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("text/event-stream")
    expect(res.headers.get("Cache-Control")).toContain("no-transform")
    expect(res.headers.get("X-Accel-Buffering")).toBe("no")

    controller.abort()
  })

  it("opens immediately and emits tick events on the interval", async () => {
    authenticateRequest.mockResolvedValue({ success: true, data: { authenticated: true } })

    const controller = new AbortController()
    const res = await GET(
      new Request("http://localhost/api/v1/events/stream", { signal: controller.signal }),
    )

    const reader = (res.body as ReadableStream<Uint8Array>).getReader()
    const decoder = new TextDecoder()

    // Prelude flushes before any tick.
    const prelude = await reader.read()
    expect(decoder.decode(prelude.value)).toContain(": connected")

    // First tick after one interval.
    await vi.advanceTimersByTimeAsync(2_000)
    const firstTick = await reader.read()
    const text = decoder.decode(firstTick.value)
    expect(text).toContain("event: tick")
    expect(text).toContain('"count":1')

    controller.abort()
    reader.cancel().catch(() => {})
  })

  it("tears down the stream when the client disconnects", async () => {
    authenticateRequest.mockResolvedValue({ success: true, data: { authenticated: true } })
    const clearSpy = vi.spyOn(globalThis, "clearInterval")

    const controller = new AbortController()
    const res = await GET(
      new Request("http://localhost/api/v1/events/stream", { signal: controller.signal }),
    )
    // Drain the prelude so the stream has started.
    const reader = (res.body as ReadableStream<Uint8Array>).getReader()
    await reader.read()

    controller.abort()

    expect(clearSpy).toHaveBeenCalled()
    reader.cancel().catch(() => {})
  })
})
