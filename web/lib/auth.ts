import { timingSafeEqual } from "node:crypto"
import type { ValidationResult } from "@/lib/api"
import { unauthorized } from "@/lib/api"
import { verifyAccessJwt } from "@/lib/cf-access"
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

export async function authenticateRequest(
  request: Request,
): Promise<ValidationResult<{ authenticated: true }>> {
  const logger = getLogger()

  // Accept X-Api-Key header (used by frontend SWR fetcher) or Authorization: Bearer
  const xApiKey = request.headers.get("X-Api-Key")
  const authHeader = request.headers.get("Authorization")

  // API-key / Bearer path (unchanged). When a caller supplies either credential
  // we validate it and, on mismatch, reject — we do not silently fall through to
  // the Access-JWT path, so an explicit bad key still returns 401 as before.
  if (xApiKey || authHeader) {
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

  // No API-key credentials → try a Cloudflare Access JWT. In production the
  // browser carries `Cf-Access-Jwt-Assertion` automatically; local dev leaves
  // CF_ACCESS_* unset, so this path is disabled and we fall straight through to
  // the 401 below (identical to prior behavior).
  const accessResult = await verifyAccessJwt(request)
  if (accessResult.ok) {
    return { success: true, data: { authenticated: true } }
  }

  logger.warn({ url: request.url }, "Auth failure: missing auth credentials")
  return { success: false, response: unauthorized("Missing Authorization header or X-Api-Key") }
}
