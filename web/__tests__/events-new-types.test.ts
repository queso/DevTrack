import { execFileSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { parse as parseYaml } from "yaml"

// The three EventType values this work item introduces. Kept as the single
// literal source for every surface asserted below.
const NEW_TYPES = ["tool_use", "checkout", "merge"] as const

const REPO_ROOT = join(process.cwd(), "..")
const SCHEMA_PATH = join(process.cwd(), "prisma", "schema.prisma")
const MIGRATIONS_DIR = join(process.cwd(), "prisma", "migrations")
const OPENAPI_YAML_PATH = join(process.cwd(), "specs", "openapi.yaml")
const CLI_DIR = join(REPO_ROOT, "cli")

const VALID_UUID = "11111111-1111-4111-8111-111111111111"

// ---------------------------------------------------------------------------
// Mocks — real schema validation and real route logic run; only the outermost
// boundaries (env, logger, db, auth) are stubbed.
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
  event: {
    create: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },
  project: {
    findUnique: vi.fn(),
    updateMany: vi.fn(),
  },
}
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }))
vi.mock("@/lib/auth", () => ({
  authenticateRequest: vi.fn(() => ({ success: true })),
}))

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/v1/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function eventBody(type: string) {
  return {
    project_id: VALID_UUID,
    type,
    title: "test event",
    occurred_at: "2026-07-09T00:00:00.000Z",
  }
}

// Parse the EventType enum members from the Prisma schema — the declared source
// of truth the OpenAPI enum must mirror (AC6).
function prismaEventTypeValues(): string[] {
  const schema = readFileSync(SCHEMA_PATH, "utf-8")
  const block = schema.match(/enum\s+EventType\s*\{([^}]*)\}/)
  if (!block) throw new Error("EventType enum not found in prisma/schema.prisma")
  return block[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("//"))
}

// ---------------------------------------------------------------------------
// AC1 + AC2 — POST /api/v1/events accepts and persists the new types
// ---------------------------------------------------------------------------

describe("POST /api/v1/events accepts new event types", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.project.updateMany.mockResolvedValue({ count: 1 })
  })

  it.each([...NEW_TYPES])("returns 201 and persists an Event with type=%s", async (type) => {
    mockPrisma.event.create.mockResolvedValue({
      id: "ev-1",
      projectId: VALID_UUID,
      type,
      title: "test event",
      metadata: {},
      occurredAt: new Date("2026-07-09T00:00:00.000Z"),
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const { POST } = await import("@/app/api/v1/events/route")
    const response = await POST(postRequest(eventBody(type)))

    expect(response.status).toBe(201)
    expect(mockPrisma.event.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type, projectId: VALID_UUID }),
      }),
    )
  })
})

// ---------------------------------------------------------------------------
// AC3 — unknown/misspelled types are still rejected with 422 and not persisted
// ---------------------------------------------------------------------------

describe("POST /api/v1/events rejects unknown event types", () => {
  beforeEach(() => vi.clearAllMocks())

  it.each([
    ["post-commit"],
    ["merged"],
    ["not_a_type"],
  ])("returns 422 for type=%s and does not persist", async (type) => {
    const { POST } = await import("@/app/api/v1/events/route")
    const response = await POST(postRequest(eventBody(type)))

    expect(response.status).toBe(422)
    expect(mockPrisma.event.create).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// AC6 — GET /api/v1/openapi.json EventType mirrors the Prisma enum exactly
// ---------------------------------------------------------------------------

describe("GET /api/v1/openapi.json EventType enum", () => {
  it("matches the Prisma EventType enum exactly and includes the new types", async () => {
    const { GET } = await import("@/app/api/v1/openapi.json/route")
    const response = await GET(new Request("http://localhost/api/v1/openapi.json"))
    const spec = await response.json()

    const specEnum: string[] = spec.components.schemas.EventType.enum
    const prismaEnum = prismaEventTypeValues()

    expect([...specEnum].sort()).toEqual([...prismaEnum].sort())

    for (const type of NEW_TYPES) {
      expect(specEnum).toContain(type)
      expect(prismaEnum).toContain(type)
    }
  })
})

// ---------------------------------------------------------------------------
// AC4 — a Prisma migration adds the three enum values, following convention
// ---------------------------------------------------------------------------

describe("Prisma migration for new EventType values", () => {
  it("adds tool_use, checkout, and merge via ALTER TYPE ... ADD VALUE", () => {
    const dirNames = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)

    const migrationsAddingAllTypes = dirNames.filter((name) => {
      const sqlPath = join(MIGRATIONS_DIR, name, "migration.sql")
      if (!existsSync(sqlPath)) return false
      const sql = readFileSync(sqlPath, "utf-8")
      return NEW_TYPES.every((type) =>
        new RegExp(`ALTER TYPE\\s+"EventType"\\s+ADD VALUE[^;]*'${type}'`, "i").test(sql),
      )
    })

    expect(
      migrationsAddingAllTypes,
      "expected a migration.sql that ADD VALUEs tool_use, checkout, and merge",
    ).not.toHaveLength(0)

    // timestamp_snake-name convention, e.g. 20260707173510_init
    const convention = /^\d{14}_[a-z0-9]+(?:_[a-z0-9]+)*$/
    for (const name of migrationsAddingAllTypes) {
      expect(name).toMatch(convention)
    }
  })
})

// ---------------------------------------------------------------------------
// AC5 — the OpenAPI spec (CLI codegen source) and the generated Go CLI surface
// both reflect the new enum values
// ---------------------------------------------------------------------------

describe("OpenAPI spec is the CLI codegen source", () => {
  it("web/specs/openapi.yaml EventType enum includes the new types", () => {
    const doc = parseYaml(readFileSync(OPENAPI_YAML_PATH, "utf-8"))
    const enumValues: string[] = doc.components.schemas.EventType.enum
    for (const type of NEW_TYPES) {
      expect(enumValues).toContain(type)
    }
  })
})

describe("generated Go CLI events createEvent surface", () => {
  const bin = join(tmpdir(), "devtrack-cli-events-new-types-test")

  // Cold CI runners download Go modules before compiling — well past vitest's
  // default 10s hook timeout (instant locally with a warm build cache).
  beforeAll(() => {
    execFileSync("go", ["build", "-o", bin, "."], { cwd: CLI_DIR })
  }, 180_000)

  // Drives the built binary; enum validation runs before any network call, so a
  // rejected type fails fast with the enum error and an accepted type proceeds
  // to the (deliberately unreachable) request. base-url points at a closed port.
  function runCreateEvent(type: string): string {
    try {
      execFileSync(
        bin,
        [
          "events",
          "createEvent",
          "--type",
          type,
          "--title",
          "x",
          "--project_id",
          VALID_UUID,
          "--occurred_at",
          "2026-07-09T00:00:00Z",
          "--base-url",
          "http://127.0.0.1:1",
        ],
        { encoding: "utf-8" },
      )
      return ""
    } catch (error) {
      const e = error as { stdout?: string; stderr?: string }
      return `${e.stdout ?? ""}${e.stderr ?? ""}`
    }
  }

  it.each([...NEW_TYPES])("accepts --type %s past enum validation", (type) => {
    const output = runCreateEvent(type)
    // Reaching the HTTP request proves the value passed the generated enum guard.
    expect(output).toMatch(/executing request/)
    expect(output).not.toMatch(/invalid value .* for --type/)
  })

  it("rejects an unknown --type with the generated enum validation error", () => {
    const output = runCreateEvent("post-commit")
    expect(output).toMatch(/invalid value "post-commit" for --type/)
  })
})
