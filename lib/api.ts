import { Prisma } from "@/lib/generated/prisma/client"
import type { z } from "zod"

export interface ApiErrorResponse {
  error: string
  message: string
  correlationId?: string
  details?: unknown
}

interface ApiErrorOptions {
  correlationId?: string
  details?: unknown
}

/**
 * Creates a standardized JSON error response.
 *
 * @param status - HTTP status code
 * @param error - Error code identifier (e.g., "NOT_FOUND", "BAD_REQUEST")
 * @param message - Human-readable error message
 * @param options - Optional correlationId and details
 * @returns Response object with JSON body and application/json Content-Type
 */
export function apiError(
  status: number,
  error: string,
  message: string,
  options: ApiErrorOptions = {},
): Response {
  const body: ApiErrorResponse = {
    error,
    message,
  }

  if (options.correlationId !== undefined) {
    body.correlationId = options.correlationId
  }

  if (options.details !== undefined) {
    body.details = options.details
  }

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  })
}

/**
 * Creates a 404 Not Found response.
 *
 * @param message - Optional custom message (defaults to standard not found message)
 * @returns Response with status 404
 */
export function notFound(message?: string): Response {
  return apiError(404, "NOT_FOUND", message ?? "Resource not found")
}

/**
 * Creates a 400 Bad Request response.
 *
 * @param message - Optional custom message (defaults to standard bad request message)
 * @param details - Optional validation details or additional context
 * @returns Response with status 400
 */
export function badRequest(message?: string, details?: unknown): Response {
  return apiError(400, "BAD_REQUEST", message ?? "Bad request", { details })
}

/**
 * Creates a 401 Unauthorized response.
 *
 * @param message - Optional custom message (defaults to standard unauthorized message)
 * @returns Response with status 401
 */
export function unauthorized(message?: string): Response {
  return apiError(401, "UNAUTHORIZED", message ?? "Unauthorized")
}

/**
 * Creates a 403 Forbidden response.
 *
 * @param message - Optional custom message (defaults to standard forbidden message)
 * @returns Response with status 403
 */
export function forbidden(message?: string): Response {
  return apiError(403, "FORBIDDEN", message ?? "Forbidden")
}

/**
 * Creates a 500 Internal Server Error response.
 *
 * @param message - Optional custom message (defaults to standard server error message)
 * @param correlationId - Optional correlation ID for tracking the error
 * @returns Response with status 500
 */
export function serverError(message?: string, correlationId?: string): Response {
  return apiError(500, "INTERNAL_SERVER_ERROR", message ?? "Internal server error", {
    correlationId,
  })
}

/**
 * Creates a 422 Unprocessable Entity response with field-level error details.
 *
 * @param fields - Object mapping field names to error messages
 * @returns Response with status 422
 */
export function unprocessableEntity(fields: Record<string, string>): Response {
  return apiError(422, "UNPROCESSABLE_ENTITY", "Validation failed", { details: fields })
}

export type ValidationSuccess<T> = { success: true; data: T }
export type ValidationFailure = { success: false; response: Response }
export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure

/**
 * Validates and parses JSON request body using a Zod schema.
 *
 * @param request - The Request object containing the JSON body
 * @param schema - Zod schema to validate against
 * @returns Success result with parsed data or failure result with error Response
 */
export async function validateBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<ValidationResult<T>> {
  let json: unknown

  try {
    const text = await request.text()

    if (!text) {
      return {
        success: false,
        response: badRequest("Request body is required"),
      }
    }

    json = JSON.parse(text)
  } catch {
    return {
      success: false,
      response: badRequest("Invalid JSON in request body"),
    }
  }

  const result = schema.safeParse(json)

  if (!result.success) {
    return {
      success: false,
      response: badRequest("Validation failed", result.error.issues),
    }
  }

  return {
    success: true,
    data: result.data,
  }
}

/**
 * Validates and parses URL search parameters using a Zod schema.
 *
 * @param request - The Request object containing the URL with search params
 * @param schema - Zod schema to validate against
 * @returns Success result with parsed data or failure result with error Response
 */
export function validateSearchParams<T>(
  request: Request,
  schema: z.ZodType<T>,
): ValidationResult<T> {
  const url = new URL(request.url)
  const params = Object.fromEntries(url.searchParams.entries())

  const result = schema.safeParse(params)

  if (!result.success) {
    return {
      success: false,
      response: badRequest("Invalid search parameters", result.error.issues),
    }
  }

  return {
    success: true,
    data: result.data,
  }
}

/**
 * Validates and parses route parameters using a Zod schema.
 *
 * @param params - Route parameters object (e.g., from Next.js dynamic routes)
 * @param schema - Zod schema to validate against
 * @returns Success result with parsed data or failure result with error Response
 */
export function validateParams<T>(
  params: Record<string, string>,
  schema: z.ZodType<T>,
): ValidationResult<T> {
  const result = schema.safeParse(params)

  if (!result.success) {
    return {
      success: false,
      response: badRequest("Invalid route parameters", result.error.issues),
    }
  }

  return {
    success: true,
    data: result.data,
  }
}

/**
 * Handles known Prisma constraint errors and returns an appropriate API response.
 *
 * @param error - The caught error
 * @returns A Response for known constraint errors, or null if the error is unrecognized
 */
export function handlePrismaError(error: unknown): Response | null {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      const target = (error.meta?.target as string[])?.join(", ") ?? "field"
      return apiError(409, "CONFLICT", `Duplicate value for ${target}`)
    }
    if (error.code === "P2025") {
      return notFound("Record not found")
    }
    if (error.code === "P2003") {
      return badRequest("Referenced record not found")
    }
  }
  return null
}
