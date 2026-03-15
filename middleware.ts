import { type NextRequest, NextResponse } from "next/server"
import { getEnv } from "@/lib/env"
import { getLogger } from "@/lib/logger"

// Runtime can be switched to Edge Runtime by replacing Pino logger with console.log
export const runtime = "nodejs"

export const config = {
  matcher: ["/api/:path*"],
}

// In-memory rate limiting (use Redis in production for distributed rate limiting)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>()
const RATE_LIMIT_WINDOW_MS = 60000 // 60 seconds

function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("X-Forwarded-For")
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim()
  }
  return "unknown"
}

function checkRateLimit(ip: string, limit: number): boolean {
  const now = Date.now()
  const record = rateLimitMap.get(ip)

  if (!record || now >= record.resetTime) {
    // New window or expired window
    rateLimitMap.set(ip, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW_MS,
    })
    return true
  }

  if (record.count >= limit) {
    return false
  }

  // Note: record.count++ is non-atomic. Under high concurrency, more requests may pass than the limit. Use Redis for production rate limiting.
  record.count++
  return true
}

function getRateLimitRetryAfter(ip: string): number {
  const record = rateLimitMap.get(ip)
  if (!record) return 60

  const now = Date.now()
  const secondsUntilReset = Math.ceil((record.resetTime - now) / 1000)
  return Math.max(1, secondsUntilReset)
}

export async function middleware(request: NextRequest) {
  const startTime = Date.now()

  try {
    const env = getEnv()
    const corsOrigin = env.CORS_ORIGIN
    const rateLimit = env.RATE_LIMIT_RPM

    // Get or generate correlation ID
    const correlationId = request.headers.get("X-Correlation-Id")?.trim() || crypto.randomUUID()

    // Handle CORS preflight (OPTIONS)
    if (request.method === "OPTIONS") {
      const headers = new Headers()

      if (corsOrigin) {
        headers.set("Access-Control-Allow-Origin", corsOrigin)
        headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
        headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Correlation-Id")

        if (corsOrigin !== "*") {
          headers.set("Access-Control-Allow-Credentials", "true")
        }
      }

      headers.set("X-Correlation-Id", correlationId)

      return new NextResponse(null, { status: 204, headers })
    }

    // Rate limiting
    const clientIp = getClientIp(request)
    if (!checkRateLimit(clientIp, rateLimit)) {
      const retryAfter = getRateLimitRetryAfter(clientIp)
      const headers = new Headers({
        "Content-Type": "application/json",
        "Retry-After": retryAfter.toString(),
      })

      // Log rate-limited request
      const duration = Date.now() - startTime
      const logger = getLogger()
      const url = new URL(request.url)
      logger.info(
        {
          method: request.method,
          path: url.pathname,
          status: 429,
          duration,
          correlationId,
        },
        "Request processed",
      )

      return new NextResponse(
        JSON.stringify({
          error: "TOO_MANY_REQUESTS",
          message: "Rate limit exceeded",
          correlationId,
        }),
        { status: 429, headers },
      )
    }

    // Continue to the next middleware/route handler
    const response = NextResponse.next()

    // Set CORS headers on response
    if (corsOrigin) {
      response.headers.set("Access-Control-Allow-Origin", corsOrigin)
      response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
      response.headers.set(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, X-Correlation-Id",
      )

      if (corsOrigin !== "*") {
        response.headers.set("Access-Control-Allow-Credentials", "true")
      }
    }

    // Set correlation ID on response
    response.headers.set("X-Correlation-Id", correlationId)

    // Log request
    const duration = Date.now() - startTime
    const logger = getLogger()
    const url = new URL(request.url)
    logger.info(
      {
        method: request.method,
        path: url.pathname,
        status: response.status,
        duration,
        correlationId,
      },
      "Request processed",
    )

    return response
  } catch (error) {
    // Handle environment validation errors
    return new NextResponse(
      JSON.stringify({
        error: "INTERNAL_SERVER_ERROR",
        message: error instanceof Error ? error.message : "Internal server error",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      },
    )
  }
}
