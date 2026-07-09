import { readFileSync } from "node:fs"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { parse as parseYaml } from "yaml"

// ---------------------------------------------------------------------------
// Mocks — real zod validation and real route logic run; only env, logger, db,
// and auth are stubbed. The db is a small in-memory project store so the tests
// assert observable find-or-create behavior regardless of whether the impl
// looks up via findFirst or findUnique, and whether it wraps the work in a
// transaction.
// ---------------------------------------------------------------------------

vi.mock("@/lib/env", () => ({
  getEnv: vi.fn(() => ({
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    LOG_LEVEL: "info",
    SITE_URL: "http://localhost:3000",
    CORS_ORIGIN: "",
    RATE_LIMIT_RPM: 60,
    DEVTRACK_API_KEY: "test-key",
  })),
}))

vi.mock("@/lib/logger", () => ({
  getLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() })),
}))

const mockPrisma = {
  event: { create: vi.fn() },
  project: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
  },
  $transaction: vi.fn(),
}
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }))
vi.mock("@/lib/auth", () => ({
  authenticateRequest: vi.fn(() => ({ success: true })),
}))

const REPO_URL = "https://github.com/acme/widgets"
const TS = "2026-07-09T00:00:00.000Z"
const OPENAPI_YAML_PATH = join(process.cwd(), "specs", "openapi.yaml")

type StoredProject = { id: string; name: string; repoUrl: string | null }
let projectStore: StoredProject[]

function repoMatches(projRepo: string | null, cond: unknown): boolean {
  if (projRepo == null || cond == null) return false
  if (typeof cond === "string") return projRepo === cond
  const c = cond as { equals?: string; endsWith?: string }
  if (typeof c.equals === "string") return projRepo === c.equals
  if (typeof c.endsWith === "string") return projRepo.endsWith(c.endsWith)
  return false
}

function scalar(cond: unknown): string | undefined {
  if (typeof cond === "string") return cond
  const c = cond as { equals?: string }
  return typeof c?.equals === "string" ? c.equals : undefined
}

function lookup(where: Record<string, unknown> | undefined): StoredProject | null {
  if (!where) return null
  if (where.repoUrl !== undefined) {
    return projectStore.find((p) => repoMatches(p.repoUrl, where.repoUrl)) ?? null
  }
  if (where.name !== undefined) {
    const target = scalar(where.name)
    return projectStore.find((p) => p.name === target) ?? null
  }
  if (where.id !== undefined) {
    const target = scalar(where.id)
    return projectStore.find((p) => p.id === target) ?? null
  }
  return null
}

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/v1/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  projectStore = []

  mockPrisma.project.findFirst.mockImplementation(({ where }: { where: Record<string, unknown> }) =>
    Promise.resolve(lookup(where)),
  )
  mockPrisma.project.findUnique.mockImplementation(({ where }: { where: Record<string, unknown> }) =>
    Promise.resolve(lookup(where)),
  )
  mockPrisma.project.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({
      id: "created-proj-id",
      name: data.name ?? null,
      repoUrl: data.repoUrl ?? null,
    }),
  )
  mockPrisma.project.updateMany.mockResolvedValue({ count: 1 })
  mockPrisma.event.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: "ev-1", ...data }),
  )
  // Support both non-transactional impls and interactive transactions
  // (prisma.$transaction(async (tx) => ...)) by running the callback against
  // the same mock client.
  mockPrisma.$transaction.mockImplementation((arg: unknown) =>
    typeof arg === "function"
      ? (arg as (tx: typeof mockPrisma) => unknown)(mockPrisma)
      : Promise.all(arg as unknown[]),
  )
})

// ---------------------------------------------------------------------------
// AC1: repo_url for a non-existent project -> 201, creates project + event
// ---------------------------------------------------------------------------

describe("POST /api/v1/events find-or-create by repo_url", () => {
  it("creates the project and the event (201) when the repo_url is unknown", async () => {
    projectStore = []

    const { POST } = await import("@/app/api/v1/events/route")
    const response = await POST(
      postRequest({ repo_url: REPO_URL, project_name: "widgets", type: "commit", occurred_at: TS, title: "x" }),
    )

    expect(response.status).toBe(201)
    expect(mockPrisma.project.create).toHaveBeenCalledTimes(1)
    expect(mockPrisma.project.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ repoUrl: REPO_URL }) }),
    )
    expect(mockPrisma.event.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ projectId: "created-proj-id" }) }),
    )
    // repo_url is identity metadata, not an Event column — it must not be
    // forwarded into the event row.
    expect(mockPrisma.event.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.not.objectContaining({ repo_url: expect.anything() }) }),
    )
  })

  // AC2: repo_url match beats a differing name (no history fork)
  it("attaches to the repo_url-matched project even when the name matches a different project", async () => {
    projectStore = [
      { id: "P-repo", name: "canonical-name", repoUrl: REPO_URL },
      { id: "P-name", name: "different-name", repoUrl: null },
    ]

    const { POST } = await import("@/app/api/v1/events/route")
    const response = await POST(
      postRequest({
        repo_url: REPO_URL,
        project_name: "different-name",
        type: "commit",
        occurred_at: TS,
        title: "x",
      }),
    )

    expect(response.status).toBe(201)
    expect(mockPrisma.project.create).not.toHaveBeenCalled()
    expect(mockPrisma.event.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ projectId: "P-repo" }) }),
    )
  })

  // AC3: name-only match when no repo_url is supplied (preserved behavior)
  it("attaches by name when no repo_url is supplied and the name exists", async () => {
    projectStore = [{ id: "P-name", name: "my-proj", repoUrl: null }]

    const { POST } = await import("@/app/api/v1/events/route")
    const response = await POST(
      postRequest({ project_name: "my-proj", type: "commit", occurred_at: TS, title: "x" }),
    )

    expect(response.status).toBe(201)
    expect(mockPrisma.project.create).not.toHaveBeenCalled()
    expect(mockPrisma.event.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ projectId: "P-name" }) }),
    )
  })

  // AC4: name-only creation for a local-folder identity
  it("creates a project keyed by name when neither the project nor a repo_url exist", async () => {
    projectStore = []

    const { POST } = await import("@/app/api/v1/events/route")
    const response = await POST(
      postRequest({ project_name: "local-folder", type: "commit", occurred_at: TS, title: "x" }),
    )

    expect(response.status).toBe(201)
    expect(mockPrisma.project.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: "local-folder" }) }),
    )
    expect(mockPrisma.event.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ projectId: "created-proj-id" }) }),
    )
  })

  // AC5: a repo_url-only request passes schema validation (not 422) and creates
  it("accepts a repo_url-only request (no 422) and creates the project", async () => {
    projectStore = []

    const { POST } = await import("@/app/api/v1/events/route")
    const response = await POST(
      postRequest({ repo_url: REPO_URL, type: "commit", occurred_at: TS, title: "x" }),
    )

    expect(response.status).not.toBe(422)
    expect(response.status).toBe(201)
    expect(mockPrisma.project.create).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// AC6: identity fields present in the zod validator and the OpenAPI CreateEvent
// ---------------------------------------------------------------------------

describe("event identity schema surface", () => {
  it("zod createEventSchema accepts a repo_url-only payload and keeps repo_url", async () => {
    const { createEventSchema } = await import("@/lib/schemas")
    // .parse throws if the refine still rejects repo_url-only payloads.
    const parsed = createEventSchema.parse({ repo_url: REPO_URL, type: "commit", occurred_at: TS })
    expect(parsed.repo_url).toBe(REPO_URL)
  })

  it("OpenAPI CreateEvent exposes repo_url and project_name and does not require project_id", () => {
    const doc = parseYaml(readFileSync(OPENAPI_YAML_PATH, "utf-8"))
    const createEvent = doc.components.schemas.CreateEvent

    expect(createEvent.properties).toHaveProperty("repo_url")
    expect(createEvent.properties).toHaveProperty("project_name")
    expect(createEvent.required ?? []).not.toContain("project_id")
  })
})
