import { describe, expect, it } from "vitest"
import {
  type ApiErrorResponse,
  apiError,
  badRequest,
  forbidden,
  notFound,
  serverError,
  unauthorized,
} from "@/lib/api"

describe("ApiErrorResponse type", () => {
  it("should match the expected shape", () => {
    const error: ApiErrorResponse = {
      error: "NOT_FOUND",
      message: "Resource not found",
    }
    expect(error).toHaveProperty("error")
    expect(error).toHaveProperty("message")
  })

  it("should support optional correlationId", () => {
    const error: ApiErrorResponse = {
      error: "SERVER_ERROR",
      message: "Internal server error",
      correlationId: "abc-123",
    }
    expect(error.correlationId).toBe("abc-123")
  })

  it("should support optional details", () => {
    const error: ApiErrorResponse = {
      error: "VALIDATION_ERROR",
      message: "Invalid input",
      details: { field: "email", reason: "invalid format" },
    }
    expect(error.details).toEqual({ field: "email", reason: "invalid format" })
  })
})

describe("apiError", () => {
  it("should create a Response with correct status code", async () => {
    const response = apiError(404, "NOT_FOUND", "Resource not found")
    expect(response).toBeInstanceOf(Response)
    expect(response.status).toBe(404)
  })

  it("should set Content-Type to application/json", async () => {
    const response = apiError(500, "SERVER_ERROR", "Something went wrong")
    expect(response.headers.get("Content-Type")).toBe("application/json")
  })

  it("should create response body with error and message", async () => {
    const response = apiError(400, "BAD_REQUEST", "Invalid input")
    const body = await response.json()
    expect(body).toEqual({
      error: "BAD_REQUEST",
      message: "Invalid input",
    })
  })

  it("should include correlationId when provided in options", async () => {
    const response = apiError(500, "SERVER_ERROR", "Error occurred", {
      correlationId: "xyz-789",
    })
    const body = await response.json()
    expect(body.correlationId).toBe("xyz-789")
  })

  it("should include details when provided in options", async () => {
    const response = apiError(400, "VALIDATION_ERROR", "Validation failed", {
      details: { fields: ["email", "password"] },
    })
    const body = await response.json()
    expect(body.details).toEqual({ fields: ["email", "password"] })
  })

  it("should include both correlationId and details when both provided", async () => {
    const response = apiError(422, "UNPROCESSABLE", "Cannot process", {
      correlationId: "req-123",
      details: { reason: "duplicate entry" },
    })
    const body = await response.json()
    expect(body).toEqual({
      error: "UNPROCESSABLE",
      message: "Cannot process",
      correlationId: "req-123",
      details: { reason: "duplicate entry" },
    })
  })

  it("should handle empty options object", async () => {
    const response = apiError(403, "FORBIDDEN", "Access denied", {})
    const body = await response.json()
    expect(body).toEqual({
      error: "FORBIDDEN",
      message: "Access denied",
    })
  })
})

describe("notFound", () => {
  it("should return 404 status code", () => {
    const response = notFound()
    expect(response.status).toBe(404)
  })

  it("should use default message when none provided", async () => {
    const response = notFound()
    const body = await response.json()
    expect(body.error).toBe("NOT_FOUND")
    expect(body.message).toBeDefined()
  })

  it("should use custom message when provided", async () => {
    const response = notFound("User not found")
    const body = await response.json()
    expect(body).toEqual({
      error: "NOT_FOUND",
      message: "User not found",
    })
  })

  it("should set Content-Type to application/json", () => {
    const response = notFound()
    expect(response.headers.get("Content-Type")).toBe("application/json")
  })
})

describe("badRequest", () => {
  it("should return 400 status code", () => {
    const response = badRequest()
    expect(response.status).toBe(400)
  })

  it("should use default message when none provided", async () => {
    const response = badRequest()
    const body = await response.json()
    expect(body.error).toBe("BAD_REQUEST")
    expect(body.message).toBeDefined()
  })

  it("should use custom message when provided", async () => {
    const response = badRequest("Invalid email format")
    const body = await response.json()
    expect(body.message).toBe("Invalid email format")
  })

  it("should include details when provided", async () => {
    const response = badRequest("Validation failed", {
      fields: { email: "required", password: "too short" },
    })
    const body = await response.json()
    expect(body.details).toEqual({
      fields: { email: "required", password: "too short" },
    })
  })

  it("should handle details without custom message", async () => {
    const response = badRequest(undefined, { fieldCount: 3 })
    const body = await response.json()
    expect(body.error).toBe("BAD_REQUEST")
    expect(body.message).toBeDefined()
    expect(body.details).toEqual({ fieldCount: 3 })
  })

  it("should NOT include details key when details is undefined", async () => {
    const response = badRequest("Invalid input", undefined)
    const body = await response.json()
    expect(body).toEqual({
      error: "BAD_REQUEST",
      message: "Invalid input",
    })
    expect(body).not.toHaveProperty("details")
  })

  it("should NOT include details key when called without details parameter", async () => {
    const response = badRequest("Invalid input")
    const body = await response.json()
    expect(body).toEqual({
      error: "BAD_REQUEST",
      message: "Invalid input",
    })
    expect(body).not.toHaveProperty("details")
  })

  it("should set Content-Type to application/json", () => {
    const response = badRequest()
    expect(response.headers.get("Content-Type")).toBe("application/json")
  })
})

describe("unauthorized", () => {
  it("should return 401 status code", () => {
    const response = unauthorized()
    expect(response.status).toBe(401)
  })

  it("should use default message when none provided", async () => {
    const response = unauthorized()
    const body = await response.json()
    expect(body.error).toBe("UNAUTHORIZED")
    expect(body.message).toBeDefined()
  })

  it("should use custom message when provided", async () => {
    const response = unauthorized("Invalid token")
    const body = await response.json()
    expect(body).toEqual({
      error: "UNAUTHORIZED",
      message: "Invalid token",
    })
  })

  it("should set Content-Type to application/json", () => {
    const response = unauthorized()
    expect(response.headers.get("Content-Type")).toBe("application/json")
  })
})

describe("forbidden", () => {
  it("should return 403 status code", () => {
    const response = forbidden()
    expect(response.status).toBe(403)
  })

  it("should use default message when none provided", async () => {
    const response = forbidden()
    const body = await response.json()
    expect(body.error).toBe("FORBIDDEN")
    expect(body.message).toBeDefined()
  })

  it("should use custom message when provided", async () => {
    const response = forbidden("Insufficient permissions")
    const body = await response.json()
    expect(body).toEqual({
      error: "FORBIDDEN",
      message: "Insufficient permissions",
    })
  })

  it("should set Content-Type to application/json", () => {
    const response = forbidden()
    expect(response.headers.get("Content-Type")).toBe("application/json")
  })
})

describe("serverError", () => {
  it("should return 500 status code", () => {
    const response = serverError()
    expect(response.status).toBe(500)
  })

  it("should use default message when none provided", async () => {
    const response = serverError()
    const body = await response.json()
    expect(body.error).toBe("INTERNAL_SERVER_ERROR")
    expect(body.message).toBeDefined()
  })

  it("should use custom message when provided", async () => {
    const response = serverError("Database connection failed")
    const body = await response.json()
    expect(body.message).toBe("Database connection failed")
  })

  it("should include correlationId when provided", async () => {
    const response = serverError("Unexpected error", "corr-456")
    const body = await response.json()
    expect(body).toEqual({
      error: "INTERNAL_SERVER_ERROR",
      message: "Unexpected error",
      correlationId: "corr-456",
    })
  })

  it("should handle correlationId without custom message", async () => {
    const response = serverError(undefined, "req-999")
    const body = await response.json()
    expect(body.error).toBe("INTERNAL_SERVER_ERROR")
    expect(body.message).toBeDefined()
    expect(body.correlationId).toBe("req-999")
  })

  it("should NOT include correlationId key when correlationId is undefined", async () => {
    const response = serverError("Database error", undefined)
    const body = await response.json()
    expect(body).toEqual({
      error: "INTERNAL_SERVER_ERROR",
      message: "Database error",
    })
    expect(body).not.toHaveProperty("correlationId")
  })

  it("should NOT include correlationId key when called without correlationId parameter", async () => {
    const response = serverError("Database error")
    const body = await response.json()
    expect(body).toEqual({
      error: "INTERNAL_SERVER_ERROR",
      message: "Database error",
    })
    expect(body).not.toHaveProperty("correlationId")
  })

  it("should set Content-Type to application/json", () => {
    const response = serverError()
    expect(response.headers.get("Content-Type")).toBe("application/json")
  })
})

describe("Response objects", () => {
  it("should return standard Web API Response objects", () => {
    const responses = [
      notFound(),
      badRequest(),
      unauthorized(),
      forbidden(),
      serverError(),
      apiError(418, "TEAPOT", "I'm a teapot"),
    ]

    for (const response of responses) {
      expect(response).toBeInstanceOf(Response)
      expect(response.headers).toBeInstanceOf(Headers)
    }
  })

  it("should be independently consumable", async () => {
    const response = badRequest("Test error")
    const body1 = await response.clone().json()
    const body2 = await response.json()
    expect(body1).toEqual(body2)
  })
})

describe("Edge cases", () => {
  it("should handle empty string messages", async () => {
    const response = apiError(400, "BAD_REQUEST", "")
    const body = await response.json()
    expect(body.message).toBe("")
  })

  it("should handle special characters in messages", async () => {
    const response = apiError(400, "BAD_REQUEST", "Invalid input: <script>alert('xss')</script>")
    const body = await response.json()
    expect(body.message).toBe("Invalid input: <script>alert('xss')</script>")
  })

  it("should handle unicode characters in messages", async () => {
    const response = apiError(400, "BAD_REQUEST", "エラーが発生しました 🚨")
    const body = await response.json()
    expect(body.message).toBe("エラーが発生しました 🚨")
  })

  it("should handle null in details", async () => {
    const response = apiError(400, "BAD_REQUEST", "Error", { details: null })
    const body = await response.json()
    expect(body.details).toBeNull()
  })

  it("should handle empty object in details", async () => {
    const response = apiError(400, "BAD_REQUEST", "Error", { details: {} })
    const body = await response.json()
    expect(body.details).toEqual({})
  })

  it("should handle arrays in details", async () => {
    const response = apiError(400, "BAD_REQUEST", "Error", {
      details: ["error1", "error2", "error3"],
    })
    const body = await response.json()
    expect(body.details).toEqual(["error1", "error2", "error3"])
  })

  it("should handle nested objects in details", async () => {
    const response = apiError(400, "BAD_REQUEST", "Error", {
      details: {
        validation: {
          fields: {
            email: ["required", "invalid format"],
            password: ["too short"],
          },
        },
      },
    })
    const body = await response.json()
    expect(body.details).toEqual({
      validation: {
        fields: {
          email: ["required", "invalid format"],
          password: ["too short"],
        },
      },
    })
  })

  it("should handle empty string correlationId", async () => {
    const response = apiError(500, "SERVER_ERROR", "Error", { correlationId: "" })
    const body = await response.json()
    expect(body.correlationId).toBe("")
  })

  it("should NOT include undefined optional fields in response body", async () => {
    const response = apiError(400, "BAD_REQUEST", "Error", {
      correlationId: undefined,
      details: undefined,
    })
    const body = await response.json()
    expect(body).toEqual({
      error: "BAD_REQUEST",
      message: "Error",
    })
    expect(body).not.toHaveProperty("correlationId")
    expect(body).not.toHaveProperty("details")
  })

  it("should NOT include undefined keys in the JSON string", async () => {
    const response = badRequest(undefined, undefined)
    const text = await response.text()
    expect(text).not.toContain("details")
    expect(text).not.toContain("correlationId")
    expect(text).toContain('"error":"BAD_REQUEST"')
    expect(text).toContain('"message":"Bad request"')
  })

  it("serverError should NOT include undefined correlationId in JSON string", async () => {
    const response = serverError(undefined, undefined)
    const text = await response.text()
    expect(text).not.toContain("correlationId")
    expect(text).toContain('"error":"INTERNAL_SERVER_ERROR"')
  })
})
