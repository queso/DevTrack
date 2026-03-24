type SecurityHeader = { key: string; value: string }

function buildContentSecurityPolicy(env: string): string {
  const scriptSrc = env === "development" ? "script-src 'self' 'unsafe-eval' 'unsafe-inline'" : "script-src 'self'"
  const connectSrc = env === "development" ? "connect-src 'self' ws: wss:" : "connect-src 'self'"

  const directives = [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    connectSrc,
    "frame-ancestors 'none'",
  ]

  return directives.join("; ")
}

export function getSecurityHeaders(env?: string): SecurityHeader[] {
  const resolvedEnv = env ?? process.env.NODE_ENV ?? "production"

  const headers: SecurityHeader[] = [
    {
      key: "Content-Security-Policy",
      value: buildContentSecurityPolicy(resolvedEnv),
    },
    {
      key: "X-Frame-Options",
      value: "DENY",
    },
    {
      key: "X-Content-Type-Options",
      value: "nosniff",
    },
    {
      key: "Referrer-Policy",
      value: "strict-origin-when-cross-origin",
    },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=()",
    },
  ]

  if (resolvedEnv === "production") {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    })
  }

  return headers
}
