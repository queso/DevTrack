export interface PaginationMeta {
  total: number
  page: number
  per_page: number
}

export interface ApiEnvelope<T> {
  data: T
  meta?: PaginationMeta
}

export interface PaginationParams {
  page: number
  per_page: number
}

export interface PrismaQueryPagination {
  skip: number
  take: number
}
