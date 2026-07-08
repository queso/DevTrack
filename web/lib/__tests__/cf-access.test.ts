// @vitest-environment node
// jose's signing checks `payload instanceof Uint8Array`; under jsdom the
// TextEncoder output is a different realm's Uint8Array and the check fails, so
// this file runs in the node environment (it exercises server-side auth only).
import type { CryptoKey, JWK } from "jose"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

// A test-local JWKS resolver stands in for the remote createRemoteJWKSet so we
// verify against a key pair we mint here rather than reaching out to Cloudflare.
// vi.hoisted lets the (hoisted) vi.mock factory close over a holder we fill in
// beforeAll once the key pair exists.
const holder = vi.hoisted(() => ({
  resolve: null as null | ReturnType<typeof import("jose").createLocalJWKSet>,
}))

vi.mock("jose", async (importOriginal) => {
  const actual = await importOriginal<typeof import("jose")>()
  return {
    ...actual,
    createRemoteJWKSet: vi.fn(() => {
      // jose calls the resolver as (protectedHeader, token) => Promise<KeyLike>
      return (
        protectedHeader: Parameters<NonNullable<typeof holder.resolve>>[0],
        token: unknown,
      ) => {
        if (!holder.resolve) throw new Error("test JWKS resolver not initialized")
        // biome-ignore lint/suspicious/noExplicitAny: delegating to jose's local resolver
        return holder.resolve(protectedHeader as any, token as any)
      }
    }),
  }
})

const TEAM_DOMAIN = "example.cloudflareaccess.com"
const AUD = "test-aud-tag-abc123"
const ISSUER = `https://${TEAM_DOMAIN}`
const KID = "test-key-1"

type Env = ReturnType<typeof import("@/lib/env").getEnv>

const baseEnv: Env = {
  DATABASE_URL: "postgresql://test:test@localhost:5432/test",
  LOG_LEVEL: "info",
  SITE_URL: "http://localhost:3000",
  CORS_ORIGIN: "",
  RATE_LIMIT_RPM: 60,
  DEVTRACK_API_KEY: "test-secret-key",
  CF_ACCESS_TEAM_DOMAIN: TEAM_DOMAIN,
  CF_ACCESS_AUD: AUD,
}

vi.mock("@/lib/env", () => ({
  getEnv: vi.fn(() => baseEnv),
}))

vi.mock("@/lib/logger", () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}))

const { getEnv } = await import("@/lib/env")
const { verifyAccessJwt } = await import("@/lib/cf-access")
const { authenticateRequest } = await import("@/lib/auth")

// The real jose signing/JWKS helpers. Loaded via importActual so they bypass
// the module mock above (which is intentionally scoped to createRemoteJWKSet —
// spreading the mock over SignJWT's realm breaks its internal encoding).
let realJose: typeof import("jose")
let privateKey: CryptoKey
let publicJwk: JWK

async function mintToken(overrides?: {
  aud?: string
  iss?: string
  expSecondsFromNow?: number
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const exp = now + (overrides?.expSecondsFromNow ?? 3600)
  return new realJose.SignJWT({})
    .setProtectedHeader({ alg: "RS256", kid: KID })
    .setIssuer(overrides?.iss ?? ISSUER)
    .setAudience(overrides?.aud ?? AUD)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(privateKey)
}

function requestWithJwt(token?: string, extraHeaders?: Record<string, string>): Request {
  const headers: Record<string, string> = { ...extraHeaders }
  if (token) headers["Cf-Access-Jwt-Assertion"] = token
  return new Request("https://devtrack.theaiteam.dev/api/v1/status/all", { headers })
}

beforeAll(async () => {
  realJose = await vi.importActual<typeof import("jose")>("jose")
  const { privateKey: priv, publicKey } = await realJose.generateKeyPair("RS256", {
    extractable: true,
  })
  privateKey = priv
  publicJwk = { ...(await realJose.exportJWK(publicKey)), kid: KID, alg: "RS256", use: "sig" }
  holder.resolve = realJose.createLocalJWKSet({ keys: [publicJwk] })
})

beforeEach(() => {
  vi.mocked(getEnv).mockReturnValue(baseEnv)
})

describe("verifyAccessJwt", () => {
  it("accepts a valid Access JWT (correct aud, iss, unexpired)", async () => {
    const token = await mintToken()
    const result = await verifyAccessJwt(requestWithJwt(token))
    expect(result).toEqual({ ok: true })
  })

  it("rejects a token with the wrong audience", async () => {
    const token = await mintToken({ aud: "some-other-app" })
    const result = await verifyAccessJwt(requestWithJwt(token))
    expect(result).toEqual({ ok: false, reason: "invalid" })
  })

  it("rejects a token with the wrong issuer", async () => {
    const token = await mintToken({ iss: "https://evil.cloudflareaccess.com" })
    const result = await verifyAccessJwt(requestWithJwt(token))
    expect(result).toEqual({ ok: false, reason: "invalid" })
  })

  it("rejects an expired token", async () => {
    const token = await mintToken({ expSecondsFromNow: -60 })
    const result = await verifyAccessJwt(requestWithJwt(token))
    expect(result).toEqual({ ok: false, reason: "invalid" })
  })

  it("rejects a garbage token", async () => {
    const result = await verifyAccessJwt(requestWithJwt("not-a-jwt.at.all"))
    expect(result).toEqual({ ok: false, reason: "invalid" })
  })

  it("reports 'missing' when the assertion header is absent", async () => {
    const result = await verifyAccessJwt(requestWithJwt())
    expect(result).toEqual({ ok: false, reason: "missing" })
  })

  it("reports 'disabled' when CF_ACCESS_TEAM_DOMAIN is unset", async () => {
    vi.mocked(getEnv).mockReturnValue({ ...baseEnv, CF_ACCESS_TEAM_DOMAIN: undefined })
    const token = await mintToken()
    const result = await verifyAccessJwt(requestWithJwt(token))
    expect(result).toEqual({ ok: false, reason: "disabled" })
  })

  it("reports 'disabled' when CF_ACCESS_AUD is unset", async () => {
    vi.mocked(getEnv).mockReturnValue({ ...baseEnv, CF_ACCESS_AUD: undefined })
    const token = await mintToken()
    const result = await verifyAccessJwt(requestWithJwt(token))
    expect(result).toEqual({ ok: false, reason: "disabled" })
  })

  it("tolerates a team domain configured with scheme and trailing slash", async () => {
    vi.mocked(getEnv).mockReturnValue({
      ...baseEnv,
      CF_ACCESS_TEAM_DOMAIN: `https://${TEAM_DOMAIN}/`,
    })
    const token = await mintToken()
    const result = await verifyAccessJwt(requestWithJwt(token))
    expect(result).toEqual({ ok: true })
  })
})

describe("authenticateRequest — Cloudflare Access integration", () => {
  it("authenticates a browser request carrying a valid Access JWT (no api key)", async () => {
    const token = await mintToken()
    const result = await authenticateRequest(requestWithJwt(token))
    expect(result.success).toBe(true)
  })

  it("rejects a browser request with an invalid Access JWT", async () => {
    const token = await mintToken({ aud: "wrong" })
    const result = await authenticateRequest(requestWithJwt(token))
    expect(result.success).toBe(false)
  })

  it("still accepts the API key path unchanged (X-Api-Key)", async () => {
    const result = await authenticateRequest(
      requestWithJwt(undefined, { "X-Api-Key": "test-secret-key" }),
    )
    expect(result.success).toBe(true)
  })

  it("a provided-but-wrong API key is rejected without falling through to the JWT path", async () => {
    // Even with a valid Access JWT present, an explicit bad key still 401s.
    const token = await mintToken()
    const result = await authenticateRequest(requestWithJwt(token, { "X-Api-Key": "wrong-key" }))
    expect(result.success).toBe(false)
  })

  it("returns 401 when unconfigured and no credentials are supplied", async () => {
    vi.mocked(getEnv).mockReturnValue({
      ...baseEnv,
      CF_ACCESS_TEAM_DOMAIN: undefined,
      CF_ACCESS_AUD: undefined,
    })
    const result = await authenticateRequest(requestWithJwt())
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.response.status).toBe(401)
    }
  })
})
