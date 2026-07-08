import { z } from "zod"

const envSchema = z.object({
  DATABASE_URL: z.string(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  SITE_URL: z.string().default("http://localhost:3000"),
  CORS_ORIGIN: z.string().default(""),
  RATE_LIMIT_RPM: z.coerce.number().int().positive().default(60),
  DEVTRACK_API_KEY: z.string().min(1).optional(),
  GITHUB_WEBHOOK_SECRET: z.string().optional(),
  // Cloudflare Access (Zero Trust) — verifies the Cf-Access-Jwt-Assertion header
  // Cloudflare injects on browser requests. Both must be set to enable the JWT
  // auth path; when either is unset the path is disabled and behavior is
  // identical to API-key-only (local dev is unaffected). These are public
  // identifiers, not secrets.
  //   CF_ACCESS_TEAM_DOMAIN — the "<team>.cloudflareaccess.com" host (no scheme)
  //   CF_ACCESS_AUD         — the Access application's Application Audience (AUD) tag
  CF_ACCESS_TEAM_DOMAIN: z.string().optional(),
  CF_ACCESS_AUD: z.string().optional(),
})

type Env = z.infer<typeof envSchema>

export function createEnv(
  envObj: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): Env {
  const result = envSchema.safeParse(envObj)

  if (!result.success) {
    const invalidVars = result.error.issues.map((issue) => {
      const path = issue.path.join(".")
      return `  ${path}: ${issue.message}`
    })

    throw new Error(`Invalid environment variables:\n${invalidVars.join("\n")}`)
  }

  return result.data
}

let _env: Env | undefined

export function getEnv(): Env {
  if (!_env) _env = createEnv()
  return _env
}
