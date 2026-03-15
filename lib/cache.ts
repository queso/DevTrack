import {
  revalidatePath as nextRevalidatePath,
  revalidateTag as nextRevalidateTag,
} from "next/cache"
import { getLogger } from "@/lib/logger"

/**
 * Revalidates cached data associated with a specific tag.
 * Wraps Next.js revalidateTag with structured logging.
 *
 * @param tag - The cache tag to revalidate
 */
export function revalidateByTag(tag: string): void {
  const logger = getLogger()
  logger.info({ tag }, "Revalidating cache by tag")
  nextRevalidateTag(tag, "default")
}

/**
 * Revalidates cached data for a specific path.
 * Wraps Next.js revalidatePath with structured logging.
 *
 * @param path - The path to revalidate
 * @param type - Optional type: "page" or "layout"
 */
export function revalidatePath(path: string, type?: "page" | "layout"): void {
  const logger = getLogger()
  logger.info({ path, type }, "Revalidating cache by path")
  nextRevalidatePath(path, type)
}

interface CacheHeadersOptions {
  maxAge?: number
  staleWhileRevalidate?: number
  isPublic?: boolean
  noStore?: boolean
}

/**
 * Creates a Cache-Control header value string.
 * Safe default is no-store when called with no arguments.
 *
 * @param options - Cache configuration options
 * @returns Cache-Control header value
 */
export function cacheHeaders(options: CacheHeadersOptions = {}): string {
  const { maxAge, staleWhileRevalidate, isPublic = false, noStore = false } = options

  // If noStore is true or no caching options provided, return no-store
  if (noStore || (maxAge === undefined && staleWhileRevalidate === undefined)) {
    return "no-store"
  }

  const directives: string[] = []

  // Add public/private directive
  directives.push(isPublic ? "public" : "private")

  // Add max-age directive if provided
  if (maxAge !== undefined) {
    directives.push(`max-age=${maxAge}`)
  }

  // Add stale-while-revalidate directive if provided
  if (staleWhileRevalidate !== undefined) {
    directives.push(`stale-while-revalidate=${staleWhileRevalidate}`)
  }

  return directives.join(", ")
}
