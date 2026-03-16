import { describe, expect, it } from "vitest"

describe("API response helpers", () => {
  it("should export all required helpers", async () => {
    const mod = await import("@/lib/api/response")

    expect(typeof mod.apiSuccess).toBe("function")
    expect(typeof mod.paginatedResponse).toBe("function")
    expect(typeof mod.parsePagination).toBe("function")
    expect(typeof mod.buildPagination).toBe("function")
  })

  it("apiSuccess should return data envelope with optional meta", async () => {
    const { apiSuccess } = await import("@/lib/api/response")

    const plain = apiSuccess({ id: "1", name: "Test" })
    expect(plain).toHaveProperty("data")
    expect(plain.data).toEqual({ id: "1", name: "Test" })

    const withMeta = apiSuccess({ id: "1" }, { total: 1, page: 1, per_page: 20 })
    expect(withMeta).toHaveProperty("data")
    expect(withMeta).toHaveProperty("meta")
    expect(withMeta.meta).toMatchObject({ total: 1, page: 1, per_page: 20 })
  })

  it("paginatedResponse and pagination helpers should compute correct skip/take", async () => {
    const { paginatedResponse, parsePagination, buildPagination } = await import("@/lib/api/response")

    // paginatedResponse returns correct meta
    const result = paginatedResponse([{ id: "a" }, { id: "b" }], 50, 2, 10)
    expect(result.data).toHaveLength(2)
    expect(result.meta).toMatchObject({ total: 50, page: 2, per_page: 10 })

    // buildPagination computes correct skip/take
    const pagination = buildPagination(3, 20)
    expect(pagination).toMatchObject({ skip: 40, take: 20 })

    // parsePagination applies defaults from URLSearchParams
    const params = new URLSearchParams("")
    const parsed = parsePagination(params)
    expect(parsed).toMatchObject({ page: 1, per_page: 20 })
  })
})
