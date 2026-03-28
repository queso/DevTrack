export interface OpenAPIInfo {
  title: string
  version: string
  description?: string
}

export interface OpenAPIServer {
  url: string
  description?: string
}

export interface OpenAPISpec {
  openapi: string
  info: OpenAPIInfo
  servers?: OpenAPIServer[]
  security?: Array<Record<string, string[]>>
  paths: Record<string, Record<string, unknown>>
  components?: {
    schemas?: Record<string, unknown>
    securitySchemes?: Record<string, unknown>
  }
}
