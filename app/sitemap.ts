import type { MetadataRoute } from "next"
import { getEnv } from "@/lib/env"

export default function sitemap(): MetadataRoute.Sitemap {
  const { SITE_URL } = getEnv()

  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
    },
  ]
}
