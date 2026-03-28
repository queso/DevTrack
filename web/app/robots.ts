import type { MetadataRoute } from "next"
import { getEnv } from "@/lib/env"

export default function robots(): MetadataRoute.Robots {
  const { SITE_URL } = getEnv()

  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${SITE_URL.replace(/\/+$/, "")}/sitemap.xml`,
  }
}
