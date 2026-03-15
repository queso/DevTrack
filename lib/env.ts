import { z } from "zod"

const envSchema = z.object({
  DATABASE_URL: z.string(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  SITE_URL: z.string().default("http://localhost:3000"),
  CORS_ORIGIN: z.string().default(""),
  RATE_LIMIT_RPM: z.coerce.number().int().positive().default(60),
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
