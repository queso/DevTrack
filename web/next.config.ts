import type { NextConfig } from "next"
import { getSecurityHeaders } from "@/lib/security-headers"

const nextConfig: NextConfig = {
  transpilePackages: ["reactive-swr"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: getSecurityHeaders(),
      },
    ]
  },
}

export default nextConfig
