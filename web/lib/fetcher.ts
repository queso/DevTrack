import type { ApiErrorResponse } from "@/lib/api"

export async function fetcher<T>(url: string, headers?: HeadersInit): Promise<T> {
  const res = headers ? await fetch(url, { headers }) : await fetch(url)
  if (!res.ok) {
    const error = new Error("Fetch failed") as Error & { status: number }
    error.status = res.status
    throw error
  }
  return res.json() as Promise<T>
}

export async function mutationFetcher<T>(
  url: string,
  { arg }: { arg: { method?: string; body?: unknown; headers?: HeadersInit } },
): Promise<T> {
  const { method = "POST", body, headers: customHeaders } = arg

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...customHeaders,
  }

  const options: RequestInit = {
    method,
    headers,
  }

  if (body !== undefined) {
    options.body = JSON.stringify(body)
  }

  const res = await fetch(url, options)

  if (!res.ok) {
    let errorBody: ApiErrorResponse
    try {
      errorBody = (await res.json()) as ApiErrorResponse
    } catch {
      errorBody = {
        error: "UNKNOWN_ERROR",
        message: "The server returned a non-JSON error response",
      }
    }
    const error = new Error(errorBody.message) as Error & {
      status: number
      body: ApiErrorResponse
    }
    error.status = res.status
    error.body = errorBody
    throw error
  }

  return res.json() as Promise<T>
}
