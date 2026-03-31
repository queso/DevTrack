import { describe, expect, it } from "vitest"
import { z } from "zod"
import {
  type ApiErrorResponse,
  validateBody,
  validateParams,
  validateSearchParams,
} from "@/lib/api"

describe("validateBody", () => {
  const userSchema = z.object({
    email: z.string().email(),
    age: z.number().int().positive(),
  })

  it("should return success with valid JSON body", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com", age: 25 }),
    })

    const result = await validateBody(request, userSchema)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({ email: "test@example.com", age: 25 })
    }
  })

  it("should return failure with invalid data", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "invalid-email", age: 25 }),
    })

    const result = await validateBody(request, userSchema)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.response).toBeInstanceOf(Response)
      expect(result.response.status).toBe(400)
      const body = (await result.response.json()) as ApiErrorResponse
      expect(body.error).toBe("BAD_REQUEST")
      expect(body.details).toBeDefined()
    }
  })

  it("should include Zod error issues in details field", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "not-an-email", age: -5 }),
    })

    const result = await validateBody(request, userSchema)

    expect(result.success).toBe(false)
    if (!result.success) {
      const body = (await result.response.json()) as ApiErrorResponse
      expect(body.details).toBeDefined()
      // Zod error.issues should be in details
      expect(Array.isArray(body.details)).toBe(true)
    }
  })

  it("should return 400 with malformed JSON", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"email": "test@example.com", age: }', // Invalid JSON
    })

    const result = await validateBody(request, userSchema)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.response.status).toBe(400)
      const body = (await result.response.json()) as ApiErrorResponse
      expect(body.message).toContain("Invalid JSON")
    }
  })

  it("should return 400 when body is empty", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    })

    const result = await validateBody(request, userSchema)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.response.status).toBe(400)
      const body = (await result.response.json()) as ApiErrorResponse
      expect(body.message).toBe("Request body is required")
    }
  })

  it("should handle nested object validation errors with full field paths", async () => {
    const nestedSchema = z.object({
      user: z.object({
        profile: z.object({
          email: z.string().email(),
          age: z.number(),
        }),
      }),
    })

    const request = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user: {
          profile: {
            email: "invalid-email",
            age: "not-a-number",
          },
        },
      }),
    })

    const result = await validateBody(request, nestedSchema)

    expect(result.success).toBe(false)
    if (!result.success) {
      const body = (await result.response.json()) as ApiErrorResponse
      expect(body.details).toBeDefined()
      // Zod issues should include full paths like ["user", "profile", "email"]
      const issues = body.details as Array<{ path: string[] }>
      expect(issues.some((issue) => issue.path.includes("profile"))).toBe(true)
    }
  })

  it("should handle missing required fields", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com" }), // Missing age
    })

    const result = await validateBody(request, userSchema)

    expect(result.success).toBe(false)
    if (!result.success) {
      const body = (await result.response.json()) as ApiErrorResponse
      expect(body.error).toBe("BAD_REQUEST")
      expect(body.details).toBeDefined()
    }
  })

  it("should handle wrong type fields", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com", age: "twenty-five" }),
    })

    const result = await validateBody(request, userSchema)

    expect(result.success).toBe(false)
    if (!result.success) {
      const body = (await result.response.json()) as ApiErrorResponse
      expect(body.details).toBeDefined()
    }
  })

  it("should work with complex Zod schemas", async () => {
    const complexSchema = z.object({
      name: z.string().min(2).max(50),
      email: z.string().email(),
      age: z.number().int().min(18).max(120),
      tags: z.array(z.string()),
      settings: z.object({
        notifications: z.boolean(),
        theme: z.enum(["light", "dark"]),
      }),
    })

    const request = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "John Doe",
        email: "john@example.com",
        age: 30,
        tags: ["developer", "tester"],
        settings: {
          notifications: true,
          theme: "dark",
        },
      }),
    })

    const result = await validateBody(request, complexSchema)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe("John Doe")
      expect(result.data.tags).toEqual(["developer", "tester"])
      expect(result.data.settings.theme).toBe("dark")
    }
  })
})

describe("validateSearchParams", () => {
  const querySchema = z.object({
    page: z.coerce.number().int().positive(),
    limit: z.coerce.number().int().positive().max(100),
    search: z.string().optional(),
  })

  it("should return success with valid search params", () => {
    const request = new Request("http://localhost/api/test?page=1&limit=10&search=test")

    const result = validateSearchParams(request, querySchema)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({ page: 1, limit: 10, search: "test" })
    }
  })

  it("should coerce string params to numbers using z.coerce", () => {
    const request = new Request("http://localhost/api/test?page=2&limit=20")

    const result = validateSearchParams(request, querySchema)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(typeof result.data.page).toBe("number")
      expect(typeof result.data.limit).toBe("number")
      expect(result.data.page).toBe(2)
      expect(result.data.limit).toBe(20)
    }
  })

  it("should return failure with invalid params", () => {
    const request = new Request("http://localhost/api/test?page=-1&limit=10")

    const result = validateSearchParams(request, querySchema)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.response.status).toBe(400)
    }
  })

  it("should handle missing optional params", () => {
    const request = new Request("http://localhost/api/test?page=1&limit=10")

    const result = validateSearchParams(request, querySchema)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.search).toBeUndefined()
    }
  })

  it("should handle missing required params", () => {
    const request = new Request("http://localhost/api/test?page=1")

    const result = validateSearchParams(request, querySchema)

    expect(result.success).toBe(false)
    if (!result.success) {
      const body = result.response.json() as Promise<ApiErrorResponse>
      body.then((data) => {
        expect(data.error).toBe("BAD_REQUEST")
        expect(data.details).toBeDefined()
      })
    }
  })

  it("should handle validation errors with details", () => {
    const request = new Request("http://localhost/api/test?page=abc&limit=200")

    const result = validateSearchParams(request, querySchema)

    expect(result.success).toBe(false)
    if (!result.success) {
      result.response.json().then((body: ApiErrorResponse) => {
        expect(body.details).toBeDefined()
      })
    }
  })

  it("should handle empty search params", () => {
    const emptySchema = z.object({
      optional: z.string().optional(),
    })
    const request = new Request("http://localhost/api/test")

    const result = validateSearchParams(request, emptySchema)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.optional).toBeUndefined()
    }
  })

  it("should handle boolean params", () => {
    const boolSchema = z.object({
      enabled: z.coerce.boolean(),
    })
    const request = new Request("http://localhost/api/test?enabled=true")

    const result = validateSearchParams(request, boolSchema)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.enabled).toBe(true)
    }
  })
})

describe("validateParams", () => {
  const paramSchema = z.object({
    id: z.string().uuid(),
    slug: z.string().min(1),
  })

  it("should return success with valid params", () => {
    const params = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      slug: "my-post",
    }

    const result = validateParams(params, paramSchema)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual(params)
    }
  })

  it("should return failure with invalid UUID", () => {
    const params = {
      id: "not-a-uuid",
      slug: "my-post",
    }

    const result = validateParams(params, paramSchema)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.response.status).toBe(400)
    }
  })

  it("should handle missing required params", () => {
    const params = {
      id: "123e4567-e89b-12d3-a456-426614174000",
    }

    const result = validateParams(params, paramSchema)

    expect(result.success).toBe(false)
    if (!result.success) {
      result.response.json().then((body: ApiErrorResponse) => {
        expect(body.error).toBe("BAD_REQUEST")
        expect(body.details).toBeDefined()
      })
    }
  })

  it("should include Zod error issues in details", () => {
    const params = {
      id: "invalid-id",
      slug: "",
    }

    const result = validateParams(params, paramSchema)

    expect(result.success).toBe(false)
    if (!result.success) {
      result.response.json().then((body: ApiErrorResponse) => {
        expect(body.details).toBeDefined()
        expect(Array.isArray(body.details)).toBe(true)
      })
    }
  })

  it("should handle numeric params with coercion", () => {
    const numericSchema = z.object({
      id: z.coerce.number().int().positive(),
    })
    const params = {
      id: "123",
    }

    const result = validateParams(params, numericSchema)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.id).toBe(123)
      expect(typeof result.data.id).toBe("number")
    }
  })

  it("should work with simple string schemas", () => {
    const simpleSchema = z.object({
      name: z.string(),
    })
    const params = {
      name: "test-name",
    }

    const result = validateParams(params, simpleSchema)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe("test-name")
    }
  })

  it("should handle optional params", () => {
    const optionalSchema = z.object({
      id: z.string(),
      tag: z.string().optional(),
    })
    const params = {
      id: "123",
    }

    const result = validateParams(params, optionalSchema)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.id).toBe("123")
      expect(result.data.tag).toBeUndefined()
    }
  })
})

describe("discriminated result types", () => {
  it("validateBody should return discriminated union type", async () => {
    const schema = z.object({ value: z.string() })
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body: JSON.stringify({ value: "test" }),
    })

    const result = await validateBody(request, schema)

    // Type narrowing should work
    if (result.success) {
      expect(result.data.value).toBe("test")
      // @ts-expect-error - response should not exist on success
      expect(result.response).toBeUndefined()
    } else {
      expect(result.response).toBeInstanceOf(Response)
      // @ts-expect-error - data should not exist on failure
      expect(result.data).toBeUndefined()
    }
  })

  it("validateSearchParams should return discriminated union type", () => {
    const schema = z.object({ q: z.string() })
    const request = new Request("http://localhost/api/test?q=search")

    const result = validateSearchParams(request, schema)

    // Type narrowing should work
    if (result.success) {
      expect(result.data.q).toBe("search")
    } else {
      expect(result.response).toBeInstanceOf(Response)
    }
  })

  it("validateParams should return discriminated union type", () => {
    const schema = z.object({ id: z.string() })
    const params = { id: "123" }

    const result = validateParams(params, schema)

    // Type narrowing should work
    if (result.success) {
      expect(result.data.id).toBe("123")
    } else {
      expect(result.response).toBeInstanceOf(Response)
    }
  })
})

describe("integration with badRequest helper", () => {
  it("validation failures should use badRequest() from lib/api", async () => {
    const schema = z.object({ email: z.string().email() })
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body: JSON.stringify({ email: "not-an-email" }),
    })

    const result = await validateBody(request, schema)

    if (!result.success) {
      const body = (await result.response.json()) as ApiErrorResponse
      // Should match badRequest() response format
      expect(body.error).toBe("BAD_REQUEST")
      expect(body.message).toBeDefined()
      expect(body.details).toBeDefined()
      expect(result.response.headers.get("Content-Type")).toBe("application/json")
    }
  })
})
