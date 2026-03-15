import { describe, expect, it } from "vitest"
import { createSSEStream } from "@/lib/sse"

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  const chunks: string[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(decoder.decode(value))
  }
  return chunks.join("")
}

describe("createSSEStream", () => {
  it("returns a readable stream, writer, and headers", () => {
    const { stream, writer, headers } = createSSEStream()

    expect(stream).toBeInstanceOf(ReadableStream)
    expect(typeof writer.send).toBe("function")
    expect(typeof writer.close).toBe("function")
    expect(headers["Content-Type"]).toBe("text/event-stream")
    expect(headers["Cache-Control"]).toBe("no-cache")
    expect(headers.Connection).toBe("keep-alive")
  })

  it("sends correctly formatted SSE messages", async () => {
    const { stream, writer } = createSSEStream()

    // Write and read concurrently to avoid TransformStream backpressure deadlock
    const [output] = await Promise.all([
      readAll(stream),
      (async () => {
        await writer.send("update", { count: 42 })
        await writer.close()
      })(),
    ])

    expect(output).toBe('event: update\ndata: {"count":42}\n\n')
  })

  it("sends multiple events in sequence", async () => {
    const { stream, writer } = createSSEStream()

    const [output] = await Promise.all([
      readAll(stream),
      (async () => {
        await writer.send("first", { a: 1 })
        await writer.send("second", { b: 2 })
        await writer.close()
      })(),
    ])

    expect(output).toContain('event: first\ndata: {"a":1}\n\n')
    expect(output).toContain('event: second\ndata: {"b":2}\n\n')
  })

  it("can be used to construct a Response", () => {
    const { stream, headers } = createSSEStream()
    const response = new Response(stream, { headers })

    expect(response.headers.get("Content-Type")).toBe("text/event-stream")
    expect(response.headers.get("Cache-Control")).toBe("no-cache")
  })
})
