import type {
  ApiEnvelope,
  PaginationMeta,
  PaginationParams,
  PrismaQueryPagination,
} from "@/types/api"

const DEFAULT_PAGE = 1
const DEFAULT_PER_PAGE = 20
const MAX_PER_PAGE = 100

export function apiSuccess<T>(data: T, meta?: PaginationMeta): ApiEnvelope<T> {
  if (meta !== undefined) {
    return { data, meta }
  }
  return { data }
}

export function paginatedResponse<T>(
  items: T[],
  total: number,
  page: number,
  perPage: number,
): ApiEnvelope<T[]> {
  return {
    data: items,
    meta: { total, page, per_page: perPage },
  }
}

export function parsePagination(searchParams: URLSearchParams): PaginationParams {
  const rawPage = searchParams.get("page")
  const rawPerPage = searchParams.get("per_page")

  const page = rawPage ? Math.max(1, Number.parseInt(rawPage, 10)) : DEFAULT_PAGE
  const perPage = rawPerPage
    ? Math.min(MAX_PER_PAGE, Math.max(1, Number.parseInt(rawPerPage, 10)))
    : DEFAULT_PER_PAGE

  return {
    page: Number.isNaN(page) ? DEFAULT_PAGE : page,
    per_page: Number.isNaN(perPage) ? DEFAULT_PER_PAGE : perPage,
  }
}

export function buildPagination(page: number, perPage: number): PrismaQueryPagination {
  return {
    skip: (page - 1) * perPage,
    take: perPage,
  }
}
