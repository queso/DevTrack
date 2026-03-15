type SecurityHeader = { key: string; value: string }

function buildContentSecurityPolicy(env: string): string {
  const scriptSrc = env === "development" ? "script-src 'self' 'unsafe-eval'" : "script-src 'self'"

  const directives = [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
  ]

  return directives.join("; ")
}

export function getSecurityHeaders(env?: string): SecurityHeader[] {
  const resolvedEnv = env ?? process.env.NODE_ENV ?? "production"

  return [
    {
      key: "Content-Security-Policy",
      value: buildContentSecurityPolicy(resolvedEnv),
    },
    {
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
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
}
