import { authenticateRequest } from "@/lib/auth"
import { getLogger } from "@/lib/logger"

// SSE needs a long-lived, unbuffered response, so this route must run on the
// Node runtime and never be statically optimized or cached.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Interval between stream messages. Each message is bytes on the wire, which
// resets the edge idle timer — Cloudflare severs idle SSE connections at
// ~100s — so a steadily-ticking stream needs no separate heartbeat.
//
// This is the spike/probe form of the endpoint (PRD: sse-live-updates): it
// emits a monotonic counter so a `curl -N` through production can confirm the
// Cloudflare + Traefik path streams (not buffers) and survives past the idle
// window. The production version replaces the timer with event-driven pushes
// and adds a slower heartbeat comment for the idle-between-events case.
const TICK_MS = 2_000

export async function GET(request: Request) {
  const auth = await authenticateRequest(request)
  if (!auth.success) return auth.response

  const logger = getLogger()
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      let count = 0

      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          // Controller already closed (client gone mid-enqueue); ignore.
        }
      }

      // A comment prelude flushes response headers immediately, so the client
      // sees an open stream without waiting for the first tick.
      send(": connected\n\n")

      const interval = setInterval(() => {
        count += 1
        send(`event: tick\ndata: ${JSON.stringify({ count, at: new Date().toISOString() })}\n\n`)
      }, TICK_MS)

      // Tear down when the client disconnects. Without this the interval leaks
      // and the server accumulates timers for abandoned tabs.
      const abort = () => {
        clearInterval(interval)
        request.signal.removeEventListener("abort", abort)
        try {
          controller.close()
        } catch {
          // Already closed.
        }
        logger.info({ ticks: count }, "SSE probe stream closed")
      }

      if (request.signal.aborted) {
        abort()
        return
      }
      request.signal.addEventListener("abort", abort)
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      // no-transform stops Cloudflare/proxies from buffering or compressing the
      // stream; no-cache keeps intermediaries from caching it.
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Belt-and-suspenders against buffering proxies (nginx-style) in any path.
      "X-Accel-Buffering": "no",
    },
  })
}
