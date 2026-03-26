import { timingSafeEqual } from "node:crypto"
import type { ValidationResult } from "@/lib/api"
import { unauthorized } from "@/lib/api"
import { getEnv } from "@/lib/env"
import { getLogger } from "@/lib/logger"

function timingSafeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) {
    // Still run timingSafeEqual on equal-length buffers to avoid short-circuit timing
    timingSafeEqual(bufA, bufA)
    return false
  }
  return timingSafeEqual(bufA, bufB)
}

export function authenticateRequest(request: Request): ValidationResult<{ authenticated: true }> {
  const logger = getLogger()

  // Accept X-Api-Key header (used by frontend SWR fetcher) or Authorization: Bearer
  const xApiKey = request.headers.get("X-Api-Key")
  const authHeader = request.headers.get("Authorization")

  let providedKey: string | undefined

  if (xApiKey) {
    providedKey = xApiKey
  } else if (authHeader) {
    if (!authHeader.startsWith("Bearer ")) {
      logger.warn({ url: request.url }, "Auth failure: unsupported auth scheme")
      return { success: false, response: unauthorized("Invalid authorization scheme") }
    }
    providedKey = authHeader.slice(7)
  }

  if (!providedKey) {
    logger.warn({ url: request.url }, "Auth failure: missing auth credentials")
    return { success: false, response: unauthorized("Missing Authorization header or X-Api-Key") }
  }
  const expectedKey = getEnv().DEVTRACK_API_KEY ?? ""

  if (!expectedKey || !timingSafeCompare(providedKey, expectedKey)) {
    logger.warn({ url: request.url }, "Auth failure: invalid API key")
    return { success: false, response: unauthorized("Invalid API key") }
  }

  return { success: true, data: { authenticated: true } }
}
