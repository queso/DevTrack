import { createRemoteJWKSet, jwtVerify } from "jose"
import { getEnv } from "@/lib/env"
import { getLogger } from "@/lib/logger"

// Cloudflare Access (Zero Trust) JWT verification.
//
// When a human hits a Cloudflare Access-protected app in a browser, Cloudflare
// authenticates them (e.g. GitHub login) and forwards the request to the origin
// with a signed `Cf-Access-Jwt-Assertion` header. We verify that assertion
// against the team's JWKS so the origin can trust the browser request without an
// API key. Service tokens (machine clients) use a different scheme
// (CF-Access-Client-Id/Secret handled by Cloudflare itself), so this only
// covers the browser path.
//
// The path is disabled unless BOTH CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD are
// set, so local dev (which sets neither) behaves exactly as before.

// The header Cloudflare Access sets on every request it forwards to the origin.
const ACCESS_JWT_HEADER = "Cf-Access-Jwt-Assertion"

export type AccessVerifyResult =
  | { ok: true }
  // `disabled`   — CF_ACCESS_* env not configured (JWT path off)
  // `missing`    — configured, but the request carried no Access assertion
  // `invalid`    — assertion present but failed verification (sig/aud/iss/exp)
  | { ok: false; reason: "disabled" | "missing" | "invalid" }

// Cache one JWKS remote set per team domain. createRemoteJWKSet returns a
// resolver that fetches the certs once and caches them (with its own
// coalescing + cooldown), so we must reuse the same instance across requests
// rather than re-creating it each call.
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

// Normalize a configured team domain to a bare host (strip any scheme and
// trailing slash) so both "example.cloudflareaccess.com" and
// "https://example.cloudflareaccess.com/" resolve to the same issuer/JWKS.
function normalizeTeamDomain(raw: string): string {
  return raw.replace(/^https?:\/\//, "").replace(/\/+$/, "")
}

function getJwks(teamDomain: string): ReturnType<typeof createRemoteJWKSet> {
  let jwks = jwksCache.get(teamDomain)
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`))
    jwksCache.set(teamDomain, jwks)
  }
  return jwks
}

/**
 * Verify the Cloudflare Access JWT (`Cf-Access-Jwt-Assertion`) on a request.
 *
 * Checks signature against the team JWKS, that `aud` contains the app's AUD tag,
 * that `iss` is the team domain, and that the token is unexpired (jwtVerify
 * enforces exp). Returns a discriminated result rather than throwing.
 */
export async function verifyAccessJwt(request: Request): Promise<AccessVerifyResult> {
  const env = getEnv()
  const { CF_ACCESS_TEAM_DOMAIN, CF_ACCESS_AUD } = env

  if (!CF_ACCESS_TEAM_DOMAIN || !CF_ACCESS_AUD) {
    return { ok: false, reason: "disabled" }
  }

  const token = request.headers.get(ACCESS_JWT_HEADER)
  if (!token) {
    return { ok: false, reason: "missing" }
  }

  const teamDomain = normalizeTeamDomain(CF_ACCESS_TEAM_DOMAIN)

  try {
    await jwtVerify(token, getJwks(teamDomain), {
      issuer: `https://${teamDomain}`,
      audience: CF_ACCESS_AUD,
    })
    return { ok: true }
  } catch (error) {
    getLogger().warn(
      { url: request.url, err: error instanceof Error ? error.message : String(error) },
      "Cloudflare Access JWT verification failed",
    )
    return { ok: false, reason: "invalid" }
  }
}
