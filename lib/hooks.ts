"use client"

import useSWR, { type KeyedMutator, type SWRConfiguration } from "swr"
import type { ApiEnvelope, PaginationMeta } from "@/types/api"

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

export function createApiFetcher() {
  const apiKey = process.env.DEVTRACK_API_KEY

  return async function apiFetcher(url: string): Promise<unknown> {
    const headers: Record<string, string> = {}
    if (apiKey) {
      headers["X-Api-Key"] = apiKey
    }

    const res = await fetch(url, { headers })

    if (!res.ok) {
      const error = new Error(`HTTP ${res.status}`) as Error & { status: number }
      error.status = res.status
      throw error
    }

    const envelope = (await res.json()) as ApiEnvelope<unknown>
    return envelope.data
  }
}

// ---------------------------------------------------------------------------
// SWR global config
// ---------------------------------------------------------------------------

export function getSWRConfig(): SWRConfiguration {
  return {
    fetcher: createApiFetcher(),
    refreshInterval: 30_000,
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  }
}

// ---------------------------------------------------------------------------
// Cache key builders
// ---------------------------------------------------------------------------

interface PaginationOpts {
  page?: number
  limit?: number
}

interface FilterOpts extends PaginationOpts {
  projectId?: string
  eventType?: string
}

function buildQueryString(params: Record<string, string | number | undefined>): string {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&")
  return qs ? `?${qs}` : ""
}

export function getProjectsKey(opts?: PaginationOpts): string {
  const base = "/api/v1/projects"
  if (!opts || (opts.page === undefined && opts.limit === undefined)) return base
  return `${base}${buildQueryString({ page: opts.page, limit: opts.limit })}`
}

export function getProjectKey(slug: string | null | undefined): string | null {
  if (!slug) return null
  return `/api/v1/projects/${slug}`
}

export function getPRsKey(opts?: FilterOpts): string {
  const base = "/api/v1/prs"
  if (!opts) return base
  return `${base}${buildQueryString({ project_id: opts.projectId, page: opts.page, limit: opts.limit })}`
}

export function getTimelineKey(opts?: FilterOpts): string {
  const base = "/api/v1/events"
  if (!opts) return base
  return `${base}${buildQueryString({ project_id: opts.projectId, type: opts.eventType, page: opts.page, limit: opts.limit })}`
}

export function getActivityKey(opts?: { projectId?: string }): string {
  const base = "/api/v1/events/summary"
  if (!opts?.projectId) return base
  return `${base}${buildQueryString({ project_id: opts.projectId })}`
}

// ---------------------------------------------------------------------------
// Hook return shape
// ---------------------------------------------------------------------------

interface HookResult<T> {
  data: T | undefined
  meta: PaginationMeta | undefined
  error: Error | undefined
  isLoading: boolean
  mutate: KeyedMutator<ApiEnvelope<T>>
}

// Internal: wraps useSWR with envelope awareness.
// The fetcher already unwraps .data, but we need .meta too.
// We achieve this by having the fetcher store the full envelope on a side channel.
// Instead, we use a custom fetcher per hook that returns the full envelope and
// then split it in the hook.

// Module-level singleton fetcher so SWR receives a stable function reference
// across renders and does not treat re-renders as cache misses.
// NOTE: process.env.DEVTRACK_API_KEY is only available server-side. Client-side
// components accessing this hook will not send the API key header. For client-side
// auth, configure the key via a NEXT_PUBLIC_ env var or use a cookie/session.
const _envelopeFetcher = (() => {
  const apiKey = process.env.DEVTRACK_API_KEY ?? process.env.NEXT_PUBLIC_DEVTRACK_API_KEY

  return async function envelopeFetcher(url: string): Promise<ApiEnvelope<unknown>> {
    const headers: Record<string, string> = {}
    if (apiKey) {
      headers["X-Api-Key"] = apiKey
    }

    const res = await fetch(url, { headers })

    if (!res.ok) {
      const error = new Error(`HTTP ${res.status}`) as Error & { status: number }
      error.status = res.status
      throw error
    }

    return res.json() as Promise<ApiEnvelope<unknown>>
  }
})()

function useEnvelopeSWR<T>(
  key: string | null,
  swrOpts?: SWRConfiguration,
): HookResult<T> {
  const { data: envelope, error, isLoading, mutate } = useSWR<ApiEnvelope<T>>(
    key,
    _envelopeFetcher as (url: string) => Promise<ApiEnvelope<T>>,
    swrOpts,
  )

  return {
    data: envelope?.data,
    meta: envelope?.meta,
    error,
    isLoading,
    mutate,
  }
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useProjects(
  opts?: PaginationOpts,
  swrOpts?: SWRConfiguration,
): HookResult<unknown[]> {
  return useEnvelopeSWR<unknown[]>(getProjectsKey(opts), swrOpts)
}

export function useProject(
  slug: string | null | undefined,
  swrOpts?: SWRConfiguration,
): HookResult<unknown> {
  return useEnvelopeSWR<unknown>(getProjectKey(slug), swrOpts)
}

export function usePRs(
  opts?: FilterOpts,
  swrOpts?: SWRConfiguration,
): HookResult<unknown[]> {
  return useEnvelopeSWR<unknown[]>(getPRsKey(opts), swrOpts)
}

export function useTimeline(
  opts?: FilterOpts,
  swrOpts?: SWRConfiguration,
): HookResult<unknown[]> {
  return useEnvelopeSWR<unknown[]>(getTimelineKey(opts), swrOpts)
}

export function useActivity(
  opts?: { projectId?: string } & SWRConfiguration,
): HookResult<unknown> {
  const { projectId, ...swrOpts } = opts ?? {}
  const key = getActivityKey({ projectId })
  return useEnvelopeSWR<unknown>(key, Object.keys(swrOpts).length ? swrOpts : undefined)
}
