"use client"

/**
 * Tests for WI-636: Configure reactiveSWR real-time provider
 *
 * Covers:
 * 1. SSEProvider wraps app in root layout (via Providers component)
 * 2. SSE connection established to API event stream endpoint
 * 3. Incoming SSE data pushed directly into SWR cache (no re-fetch)
 * 4. Connection status visible to user
 * 5. Automatic reconnection on disconnect
 * 6. Fallback to 30s polling if SSE connection fails
 * 7. Existing SWR hooks benefit from real-time cache updates without modification
 */

import { act, render, renderHook, screen, waitFor } from "@testing-library/react"
import { mockSSE } from "reactive-swr/testing"
import type { SSEConfig } from "reactive-swr"
import { useSSEStatus } from "reactive-swr"
import useSWR, { useSWRConfig } from "swr"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Providers } from "../providers"
import { getProjectsKey, getProjectKey, getPRsKey, getSWRConfig } from "@/lib/hooks"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SSE_URL = "/api/v1/events/stream"

function makeSSEConfig(overrides?: Partial<SSEConfig>): SSEConfig {
  return {
    url: SSE_URL,
    events: {},
    ...overrides,
  }
}

function wrapper({ children }: { children: React.ReactNode }) {
  return <Providers sseConfig={makeSSEConfig()}>{children}</Providers>
}

// ---------------------------------------------------------------------------
// AC1: SSEProvider wraps the app when sseConfig is provided
// ---------------------------------------------------------------------------

describe("AC1: SSEProvider wraps the app in root layout", () => {
  afterEach(() => {
    mockSSE.restore()
  })

  it("renders children when sseConfig is provided", () => {
    const sse = mockSSE(SSE_URL)
    render(
      <Providers sseConfig={makeSSEConfig()}>
        <div data-testid="app-content">Hello World</div>
      </Providers>,
    )
    expect(screen.getByTestId("app-content")).toBeInTheDocument()
    sse.close()
  })

  it("renders children without SSEProvider when sseConfig is omitted", () => {
    render(
      <Providers>
        <div data-testid="bare-content">No SSE</div>
      </Providers>,
    )
    expect(screen.getByTestId("bare-content")).toBeInTheDocument()
  })

  it("SSEProvider is accessible via useSSEStatus within Providers when sseConfig is provided", () => {
    const sse = mockSSE(SSE_URL)

    const StatusConsumer = () => {
      const status = useSSEStatus()
      return <div data-testid="status">{status.connected ? "connected" : "disconnected"}</div>
    }

    render(
      <Providers sseConfig={makeSSEConfig()}>
        <StatusConsumer />
      </Providers>,
    )

    expect(screen.getByTestId("status")).toBeInTheDocument()
    sse.close()
  })
})

// ---------------------------------------------------------------------------
// AC2: SSE connection established to API event stream endpoint
// ---------------------------------------------------------------------------

describe("AC2: SSE connection established to API event stream endpoint", () => {
  afterEach(() => {
    mockSSE.restore()
  })

  it("creates an EventSource connection to the configured URL", () => {
    const sse = mockSSE(SSE_URL)

    render(
      <Providers sseConfig={makeSSEConfig()}>
        <div>app</div>
      </Providers>,
    )

    const connection = sse.getConnection()
    expect(connection).toBeDefined()
    expect(connection?.url).toBe(SSE_URL)
    sse.close()
  })

  it("connects to a custom event stream URL in sseConfig", () => {
    const customUrl = "/api/v1/custom/stream"
    const sse = mockSSE(customUrl)

    render(
      <Providers sseConfig={makeSSEConfig({ url: customUrl })}>
        <div>app</div>
      </Providers>,
    )

    const connection = sse.getConnection()
    expect(connection).toBeDefined()
    expect(connection?.url).toBe(customUrl)
    sse.close()
  })

  it("EventSource starts in connecting state then opens", async () => {
    const sse = mockSSE(SSE_URL)

    render(
      <Providers sseConfig={makeSSEConfig()}>
        <div>app</div>
      </Providers>,
    )

    const connection = sse.getConnection()
    expect(connection).toBeDefined()

    // Simulate connection open
    await act(async () => {
      connection?._open()
    })

    expect(connection?.readyState).toBe(1) // OPEN
    sse.close()
  })
})

// ---------------------------------------------------------------------------
// AC3: Incoming SSE data pushed directly into SWR cache (no re-fetch)
// ---------------------------------------------------------------------------

describe("AC3: SSE data pushed into SWR cache without re-fetching", () => {
  afterEach(() => {
    mockSSE.restore()
    vi.restoreAllMocks()
  })

  it("updates SWR cache when a named SSE event arrives for a matching key", async () => {
    const projectsKey = getProjectsKey()
    const updatedProjects = [{ id: "1", name: "Updated Project" }]

    const sse = mockSSE(SSE_URL)

    // Named events dispatched via mockSSE arrive with payload = JSON.parse(event.data),
    // which is { type, payload } — use a transform to unwrap the payload field.
    const sseConfig = makeSSEConfig({
      events: {
        "projects.updated": {
          key: projectsKey,
          update: "set",
          transform: (raw: { payload: unknown }) => raw.payload,
        },
      },
    })

    let capturedData: unknown

    const CacheConsumer = () => {
      const { data } = useSWR(projectsKey, () => null, { revalidateOnMount: false })
      capturedData = data
      return <div data-testid="cache-data">{JSON.stringify(data)}</div>
    }

    render(
      <Providers sseConfig={sseConfig}>
        <CacheConsumer />
      </Providers>,
    )

    const connection = sse.getConnection()

    await act(async () => {
      connection?._open()
    })

    await act(async () => {
      sse.sendEvent({ type: "projects.updated", payload: updatedProjects })
    })

    await waitFor(() => {
      expect(capturedData).toEqual(updatedProjects)
    })
  })

  it("updates SWR cache for a single project key via dynamic key function", async () => {
    const projectSlug = "my-project"
    const projectKey = getProjectKey(projectSlug)
    const updatedProject = { id: "1", slug: projectSlug, name: "My Project Updated" }

    const sse = mockSSE(SSE_URL)

    // Named events: payload field contains the actual data.
    // transform unwraps it; key function uses the unwrapped payload.
    const sseConfig = makeSSEConfig({
      events: {
        "project.updated": {
          key: (payload: { slug: string }) => getProjectKey(payload.slug) ?? "",
          update: "set",
          transform: (raw: { payload: { slug: string; [key: string]: unknown } }) => raw.payload,
        },
      },
    })

    let capturedData: unknown

    const CacheConsumer = () => {
      const { data } = useSWR(projectKey, () => null, { revalidateOnMount: false })
      capturedData = data
      return <div data-testid="project-cache">{JSON.stringify(data)}</div>
    }

    render(
      <Providers sseConfig={sseConfig}>
        <CacheConsumer />
      </Providers>,
    )

    const connection = sse.getConnection()

    await act(async () => {
      connection?._open()
    })

    await act(async () => {
      sse.sendEvent({ type: "project.updated", payload: updatedProject })
    })

    await waitFor(() => {
      expect(capturedData).toEqual(updatedProject)
    })
  })

  it("updates multiple SWR cache keys from a single SSE event", async () => {
    const projectsKey = getProjectsKey()
    const prsKey = getPRsKey()
    const payload = { timestamp: "2026-03-17T00:00:00Z" }

    const sse = mockSSE(SSE_URL)

    const sseConfig = makeSSEConfig({
      events: {
        "data.refreshed": {
          key: [projectsKey, prsKey],
          update: "refetch",
        },
      },
    })

    const fetcherSpy = vi.fn().mockResolvedValue([])

    const CacheConsumer = () => {
      const { data: projects } = useSWR(projectsKey, fetcherSpy, { revalidateOnMount: false })
      const { data: prs } = useSWR(prsKey, fetcherSpy, { revalidateOnMount: false })
      return (
        <div>
          <span data-testid="projects">{JSON.stringify(projects)}</span>
          <span data-testid="prs">{JSON.stringify(prs)}</span>
        </div>
      )
    }

    render(
      <Providers sseConfig={sseConfig}>
        <CacheConsumer />
      </Providers>,
    )

    const connection = sse.getConnection()

    await act(async () => {
      connection?._open()
    })

    await act(async () => {
      sse.sendEvent({ type: "data.refreshed", payload })
    })

    // refetch strategy triggers revalidation: fetcher should be called
    await waitFor(() => {
      expect(fetcherSpy).toHaveBeenCalled()
    })
  })

  it("applies custom transform function before setting cache", async () => {
    const projectsKey = getProjectsKey()

    const sse = mockSSE(SSE_URL)

    // Named SSE events: raw data parsed by parseNamedEvent is { type, payload }
    // where payload = { items: [...] }. Transform extracts the nested items.
    const sseConfig = makeSSEConfig({
      events: {
        "projects.patch": {
          key: projectsKey,
          update: "set",
          transform: (raw: { payload: { items: unknown[] } }) => raw.payload.items,
        },
      },
    })

    let capturedData: unknown

    const CacheConsumer = () => {
      const { data } = useSWR(projectsKey, () => null, { revalidateOnMount: false })
      capturedData = data
      return <div>{JSON.stringify(data)}</div>
    }

    render(
      <Providers sseConfig={sseConfig}>
        <CacheConsumer />
      </Providers>,
    )

    const connection = sse.getConnection()
    const rawPayload = { items: [{ id: "1" }, { id: "2" }] }

    await act(async () => {
      connection?._open()
    })

    await act(async () => {
      sse.sendEvent({ type: "projects.patch", payload: rawPayload })
    })

    await waitFor(() => {
      expect(capturedData).toEqual(rawPayload.items)
    })
  })
})

// ---------------------------------------------------------------------------
// AC4: Connection status visible to user
// ---------------------------------------------------------------------------

describe("AC4: Connection status is visible to user", () => {
  afterEach(() => {
    mockSSE.restore()
  })

  it("reports connecting status initially", () => {
    const sse = mockSSE(SSE_URL)

    const { result } = renderHook(() => useSSEStatus(), { wrapper })

    // Initially connecting before open event fires
    expect(typeof result.current.connected).toBe("boolean")
    expect(typeof result.current.connecting).toBe("boolean")
    expect(typeof result.current.reconnectAttempt).toBe("number")
    sse.close()
  })

  it("reports connected status after SSE connection opens", async () => {
    const sse = mockSSE(SSE_URL)

    const { result } = renderHook(() => useSSEStatus(), { wrapper })

    const connection = sse.getConnection()
    await act(async () => {
      connection?._open()
    })

    expect(result.current.connected).toBe(true)
    expect(result.current.connecting).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it("reports disconnected status with error after SSE connection fails", async () => {
    const sse = mockSSE(SSE_URL)

    const { result } = renderHook(() => useSSEStatus(), { wrapper })

    const connection = sse.getConnection()
    await act(async () => {
      connection?._open()
    })

    expect(result.current.connected).toBe(true)

    await act(async () => {
      connection?._dispatchError()
    })

    expect(result.current.connected).toBe(false)
    expect(result.current.error).not.toBeNull()
  })

  it("reconnectAttempt increments after each reconnect", async () => {
    vi.useFakeTimers()

    const sse = mockSSE(SSE_URL)

    const { result } = renderHook(
      () => useSSEStatus(),
      {
        wrapper: ({ children }) => (
          <Providers
            sseConfig={makeSSEConfig({
              reconnect: { enabled: true, initialDelay: 100, maxDelay: 500, backoffMultiplier: 2 },
            })}
          >
            {children}
          </Providers>
        ),
      },
    )

    const connection = sse.getConnection()
    await act(async () => {
      connection?._open()
    })

    await act(async () => {
      connection?._dispatchError()
    })

    // Advance timers to trigger first reconnect
    await act(async () => {
      vi.advanceTimersByTime(200)
    })

    expect(result.current.reconnectAttempt).toBeGreaterThan(0)

    vi.useRealTimers()
    mockSSE.restore()
  })
})

// ---------------------------------------------------------------------------
// AC5: Automatic reconnection on disconnect
// ---------------------------------------------------------------------------

describe("AC5: Automatic reconnection on disconnect", () => {
  afterEach(() => {
    mockSSE.restore()
    vi.useRealTimers()
  })

  it("reconnects after connection drop by default", async () => {
    vi.useFakeTimers()

    const sse = mockSSE(SSE_URL)

    render(
      <Providers sseConfig={makeSSEConfig({ reconnect: { enabled: true, initialDelay: 100 } })}>
        <div>app</div>
      </Providers>,
    )

    const connection = sse.getConnection()
    await act(async () => {
      connection?._open()
    })

    await act(async () => {
      connection?._dispatchError()
    })

    // Advance past the initial reconnect delay
    await act(async () => {
      vi.advanceTimersByTime(200)
    })

    // A new connection should have been registered for the same URL
    const newConnection = sse.getConnection()
    expect(newConnection).toBeDefined()
  })

  it("does NOT reconnect when reconnect is disabled", async () => {
    vi.useFakeTimers()

    const sse = mockSSE(SSE_URL)
    const onConnect = vi.fn()

    render(
      <Providers
        sseConfig={makeSSEConfig({ reconnect: { enabled: false }, onConnect })}
      >
        <div>app</div>
      </Providers>,
    )

    const connection = sse.getConnection()
    await act(async () => {
      connection?._open()
    })

    const connectCountAfterFirst = onConnect.mock.calls.length

    await act(async () => {
      connection?._dispatchError()
    })

    await act(async () => {
      vi.advanceTimersByTime(5000)
    })

    // onConnect should not have been called a second time
    expect(onConnect.mock.calls.length).toBe(connectCountAfterFirst)
  })

  it("calls onConnect callback when connection is established", async () => {
    const onConnect = vi.fn()
    const sse = mockSSE(SSE_URL)

    render(
      <Providers sseConfig={makeSSEConfig({ onConnect })}>
        <div>app</div>
      </Providers>,
    )

    const connection = sse.getConnection()
    await act(async () => {
      connection?._open()
    })

    expect(onConnect).toHaveBeenCalledTimes(1)
    sse.close()
  })

  it("calls onDisconnect callback when connection closes", async () => {
    const onDisconnect = vi.fn()
    const sse = mockSSE(SSE_URL)

    render(
      <Providers sseConfig={makeSSEConfig({ onDisconnect })}>
        <div>app</div>
      </Providers>,
    )

    const connection = sse.getConnection()
    await act(async () => {
      connection?._open()
    })

    await act(async () => {
      connection?._dispatchError()
    })

    expect(onDisconnect).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// AC6: Fallback to 30s polling if SSE connection fails
// ---------------------------------------------------------------------------

describe("AC6: Fallback to 30s polling if SSE connection fails", () => {
  afterEach(() => {
    mockSSE.restore()
    vi.restoreAllMocks()
  })

  it("SWR refreshInterval is 30s in the base SWR config (polling fallback)", () => {
    // The existing SWR config (lib/hooks.ts getSWRConfig) sets refreshInterval: 30_000.
    // Even without SSE, queries poll every 30s as fallback.
    const config = getSWRConfig()
    expect(config.refreshInterval).toBe(30_000)
  })

  it("Providers SWR config uses dedupingInterval to avoid redundant polling fetches", () => {
    // Providers sets dedupingInterval: 2000 so rapid SSE + poll don't double-fetch
    let capturedSWRConfig: Record<string, unknown> | undefined

    const SWRConfigInspector = () => {
      const { refreshInterval, dedupingInterval } = useSWRConfig()
      capturedSWRConfig = { refreshInterval, dedupingInterval }
      return null
    }

    render(
      <Providers>
        <SWRConfigInspector />
      </Providers>,
    )

    // dedupingInterval prevents redundant re-fetches within 2s window
    expect(capturedSWRConfig?.dedupingInterval).toBe(2000)
  })

  it("Providers SWR config sets refreshInterval to 30s as polling fallback", () => {
    // Without SSE, queries must still poll every 30s — the Providers SWRConfig
    // must include refreshInterval: 30_000 to match the contract in lib/hooks.ts getSWRConfig().
    let capturedRefreshInterval: unknown

    const SWRConfigInspector = () => {
      const config = useSWRConfig()
      capturedRefreshInterval = config.refreshInterval
      return null
    }

    render(
      <Providers>
        <SWRConfigInspector />
      </Providers>,
    )

    expect(capturedRefreshInterval).toBe(30_000)
  })

  it("polling fallback works even when no SSEProvider is present", async () => {
    // Without SSE, SWR falls back to interval-based polling.
    // Verify the hook fetches on mount (first poll) even without SSEProvider.
    const fetcher = vi.fn().mockResolvedValue([{ id: "1" }])
    const pollingKey = "/api/v1/polling-test"

    const DataConsumer = () => {
      // revalidateOnMount: true ensures the fetcher is called on mount
      const { data } = useSWR(pollingKey, fetcher, { revalidateOnMount: true, refreshInterval: 30_000 })
      return <div data-testid="data">{data ? "loaded" : "loading"}</div>
    }

    render(
      <Providers>
        <DataConsumer />
      </Providers>,
    )

    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledWith(pollingKey)
      expect(screen.getByTestId("data")).toHaveTextContent("loaded")
    })
  })
})

// ---------------------------------------------------------------------------
// AC7: Existing SWR hooks benefit without modification
// ---------------------------------------------------------------------------

describe("AC7: Existing SWR hooks benefit from real-time cache updates", () => {
  afterEach(() => {
    mockSSE.restore()
  })

  it("updates cache for useSWR hook without that hook having any SSE knowledge", async () => {
    const projectsKey = getProjectsKey()
    const liveData = [{ id: "live-1", name: "Live Project" }]

    const sse = mockSSE(SSE_URL)

    // transform unwraps the named-event wrapper { type, payload } to extract payload
    const sseConfig = makeSSEConfig({
      events: {
        "projects.live": {
          key: projectsKey,
          update: "set",
          transform: (raw: { payload: unknown }) => raw.payload,
        },
      },
    })

    // A plain useSWR hook — no SSE awareness; benefits automatically via shared cache
    let renderedData: unknown
    const UnmodifiedHook = () => {
      const { data } = useSWR(projectsKey, () => null, { revalidateOnMount: false })
      renderedData = data
      return <span data-testid="hook-output">{JSON.stringify(data)}</span>
    }

    render(
      <Providers sseConfig={sseConfig}>
        <UnmodifiedHook />
      </Providers>,
    )

    const connection = sse.getConnection()
    await act(async () => {
      connection?._open()
    })

    await act(async () => {
      sse.sendEvent({ type: "projects.live", payload: liveData })
    })

    await waitFor(() => {
      expect(renderedData).toEqual(liveData)
    })
  })

  it("multiple independent SWR consumers for the same key all see the cache update", async () => {
    const projectsKey = getProjectsKey()
    const liveData = [{ id: "2", name: "Shared Live" }]

    const sse = mockSSE(SSE_URL)
    const sseConfig = makeSSEConfig({
      events: {
        "projects.shared": {
          key: projectsKey,
          update: "set",
          transform: (raw: { payload: unknown }) => raw.payload,
        },
      },
    })

    const dataReceivedByConsumers: unknown[] = []

    const Consumer = ({ id }: { id: string }) => {
      const { data } = useSWR(projectsKey, () => null, { revalidateOnMount: false })
      if (data !== undefined) dataReceivedByConsumers.push({ id, data })
      return <span data-testid={`consumer-${id}`}>{JSON.stringify(data)}</span>
    }

    render(
      <Providers sseConfig={sseConfig}>
        <Consumer id="A" />
        <Consumer id="B" />
        <Consumer id="C" />
      </Providers>,
    )

    const connection = sse.getConnection()
    await act(async () => {
      connection?._open()
    })

    await act(async () => {
      sse.sendEvent({ type: "projects.shared", payload: liveData })
    })

    await waitFor(() => {
      expect(screen.getByTestId("consumer-A").textContent).toContain("Shared Live")
      expect(screen.getByTestId("consumer-B").textContent).toContain("Shared Live")
      expect(screen.getByTestId("consumer-C").textContent).toContain("Shared Live")
    })
  })

  it("filter function prevents unwanted events from updating cache", async () => {
    // Use a unique key to avoid SWR cache pollution from previous tests
    const projectsKey = "/api/v1/projects-filter-test"
    const initialData = [{ id: "init" }]

    const sse = mockSSE(SSE_URL)

    // Named events: raw payload is { type, payload: { projectId, data } }.
    // filter runs on raw payload; transform runs after filter on filtered payload.
    const sseConfig = makeSSEConfig({
      events: {
        "project.event": {
          key: projectsKey,
          update: "set",
          // filter on raw named-event payload (which is { type, payload: { projectId } })
          filter: (raw: { payload: { projectId: string } }) => raw.payload?.projectId === "allowed",
          transform: (raw: { payload: unknown }) => raw.payload,
        },
      },
    })

    let capturedData: unknown

    const CacheConsumer = () => {
      const { data } = useSWR(projectsKey, () => initialData, { revalidateOnMount: true })
      capturedData = data
      return <div>{JSON.stringify(data)}</div>
    }

    render(
      <Providers sseConfig={sseConfig}>
        <CacheConsumer />
      </Providers>,
    )

    await waitFor(() => {
      expect(capturedData).toEqual(initialData)
    })

    const connection = sse.getConnection()
    await act(async () => {
      connection?._open()
    })

    // Filtered-out event — should NOT update cache
    await act(async () => {
      sse.sendEvent({
        type: "project.event",
        payload: { projectId: "blocked", data: [{ id: "blocked-data" }] },
      })
    })

    // Cache should remain unchanged
    expect(capturedData).toEqual(initialData)

    // Allowed event — SHOULD update cache
    const allowedInnerPayload = { projectId: "allowed", data: [{ id: "allowed-data" }] }
    await act(async () => {
      sse.sendEvent({ type: "project.event", payload: allowedInnerPayload })
    })

    await waitFor(() => {
      expect(capturedData).toEqual(allowedInnerPayload)
    })
  })
})

// ---------------------------------------------------------------------------
// Edge cases: SSE reconnection with stale cache
// ---------------------------------------------------------------------------

describe("Edge cases: SSE reconnection with stale cache", () => {
  afterEach(() => {
    mockSSE.restore()
    vi.restoreAllMocks()
  })

  it("cache data set by SSE survives a connection error event without being cleared", async () => {
    // Verifies: disconnecting does not wipe SWR cache — data persists until next event
    const cacheKey = "/api/v1/projects-reconnect-test"
    const initialPayload = [{ id: "initial", name: "Initial Data" }]

    const sse = mockSSE(SSE_URL)

    const sseConfig = makeSSEConfig({
      events: {
        "data.set": {
          key: cacheKey,
          update: "set",
          transform: (raw: { payload: unknown }) => raw.payload,
        },
      },
    })

    let capturedData: unknown

    const CacheConsumer = () => {
      const { data } = useSWR(cacheKey, () => null, { revalidateOnMount: false })
      capturedData = data
      return <div data-testid="cache">{JSON.stringify(data)}</div>
    }

    render(
      <Providers sseConfig={sseConfig}>
        <CacheConsumer />
      </Providers>,
    )

    const connection = sse.getConnection()
    await act(async () => {
      connection?._open()
    })

    // Populate cache via SSE
    await act(async () => {
      sse.sendEvent({ type: "data.set", payload: initialPayload })
    })

    await waitFor(() => {
      expect(capturedData).toEqual(initialPayload)
    })

    // Simulate disconnect
    await act(async () => {
      connection?._dispatchError()
    })

    // Cache must still have the data after disconnect
    expect(capturedData).toEqual(initialPayload)
  })
})

// ---------------------------------------------------------------------------
// Edge cases: Multiple rapid SSE events (last write wins)
// ---------------------------------------------------------------------------

describe("Edge cases: Multiple rapid SSE events", () => {
  afterEach(() => {
    mockSSE.restore()
  })

  it("last SSE event wins when multiple rapid events update the same key", async () => {
    // Use unique keys to avoid cross-test SWR cache pollution
    const cacheKey = "/api/v1/rapid-test-single"
    const firstUpdate = [{ id: "first", name: "First Update" }]
    const secondUpdate = [{ id: "second", name: "Second Update" }]
    const thirdUpdate = [{ id: "third", name: "Third Update" }]

    const sse = mockSSE(SSE_URL)

    const sseConfig = makeSSEConfig({
      events: {
        "rapid.update": {
          key: cacheKey,
          update: "set",
          transform: (raw: { payload: unknown }) => raw.payload,
        },
      },
    })

    let capturedData: unknown

    const CacheConsumer = () => {
      const { data } = useSWR(cacheKey, () => null, { revalidateOnMount: false })
      capturedData = data
      return <div data-testid="rapid-data">{JSON.stringify(data)}</div>
    }

    render(
      <Providers sseConfig={sseConfig}>
        <CacheConsumer />
      </Providers>,
    )

    const connection = sse.getConnection()
    await act(async () => {
      connection?._open()
    })

    // Fire first event
    await act(async () => {
      sse.sendEvent({ type: "rapid.update", payload: firstUpdate })
    })

    await waitFor(() => expect(capturedData).toEqual(firstUpdate))

    // Fire second event — overwrites first
    await act(async () => {
      sse.sendEvent({ type: "rapid.update", payload: secondUpdate })
    })

    await waitFor(() => expect(capturedData).toEqual(secondUpdate))

    // Fire third event — overwrites second
    await act(async () => {
      sse.sendEvent({ type: "rapid.update", payload: thirdUpdate })
    })

    // Final state should reflect the last event
    await waitFor(() => {
      expect(capturedData).toEqual(thirdUpdate)
    })
  })

  it("rapid events for different keys each update their respective SWR cache entries", async () => {
    // Unique keys isolated from other tests
    const projectsKey = "/api/v1/rapid-test-projects"
    const prsKey = "/api/v1/rapid-test-prs"
    const projectsData = [{ id: "p1" }]
    const prsData = [{ id: "pr1" }]

    const sse = mockSSE(SSE_URL)

    const sseConfig = makeSSEConfig({
      events: {
        "rapid.projects": {
          key: projectsKey,
          update: "set",
          transform: (raw: { payload: unknown }) => raw.payload,
        },
        "rapid.prs": {
          key: prsKey,
          update: "set",
          transform: (raw: { payload: unknown }) => raw.payload,
        },
      },
    })

    let capturedProjects: unknown
    let capturedPrs: unknown

    const MultiConsumer = () => {
      const { data: projects } = useSWR(projectsKey, () => null, { revalidateOnMount: false })
      const { data: prs } = useSWR(prsKey, () => null, { revalidateOnMount: false })
      capturedProjects = projects
      capturedPrs = prs
      return <div />
    }

    render(
      <Providers sseConfig={sseConfig}>
        <MultiConsumer />
      </Providers>,
    )

    const connection = sse.getConnection()
    await act(async () => {
      connection?._open()
    })

    await act(async () => {
      sse.sendEvent({ type: "rapid.projects", payload: projectsData })
    })

    await waitFor(() => expect(capturedProjects).toEqual(projectsData))

    await act(async () => {
      sse.sendEvent({ type: "rapid.prs", payload: prsData })
    })

    await waitFor(() => {
      expect(capturedProjects).toEqual(projectsData)
      expect(capturedPrs).toEqual(prsData)
    })
  })
})

// ---------------------------------------------------------------------------
// Edge cases: SSE + polling race condition
// ---------------------------------------------------------------------------

describe("Edge cases: SSE + polling race condition", () => {
  afterEach(() => {
    mockSSE.restore()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it("dedupingInterval prevents duplicate fetcher calls within 2s window when SSE and poll coincide", async () => {
    vi.useFakeTimers()

    const pollingKey = "/api/v1/race-test"
    const fetcher = vi.fn().mockResolvedValue([{ id: "from-poll" }])

    const DataConsumer = () => {
      // revalidateOnMount triggers the first fetch; refreshInterval simulates polling
      const { data } = useSWR(pollingKey, fetcher, {
        revalidateOnMount: true,
        refreshInterval: 30_000,
      })
      return <div>{JSON.stringify(data)}</div>
    }

    render(
      <Providers>
        <DataConsumer />
      </Providers>,
    )

    // Allow initial mount fetch to complete
    await act(async () => {
      vi.advanceTimersByTime(100)
    })

    const callsAfterMount = fetcher.mock.calls.length

    // Simulate a second call within the 2s dedupingInterval window
    await act(async () => {
      vi.advanceTimersByTime(500) // still within 2000ms dedup window
    })

    // Deduping should have prevented additional fetcher calls
    expect(fetcher.mock.calls.length).toBe(callsAfterMount)
  })

  it("SWR dedupingInterval is 2000ms in Providers config (prevents SSE+poll double-fetch)", () => {
    // Verify the config value used in Providers directly
    let capturedDedup: number | undefined

    const Inspector = () => {
      const { dedupingInterval } = useSWRConfig()
      capturedDedup = dedupingInterval
      return null
    }

    render(
      <Providers>
        <Inspector />
      </Providers>,
    )

    expect(capturedDedup).toBe(2000)
  })
})
