# app/ -- Next.js App Router

This directory uses the Next.js App Router with file-based routing.

## Routing Conventions

- `page.tsx` -- Route component (renders at that URL segment)
- `layout.tsx` -- Shared layout wrapping child routes
- `loading.tsx` -- Loading UI (React Suspense boundary)
- `error.tsx` -- Error boundary (`"use client"` required)
- `not-found.tsx` -- 404 UI for the segment

Create new routes by adding directories with `page.tsx` files. For example, `app/about/page.tsx` renders at `/about`.

## Component Rules

- **Server Components by default.** Every component in `app/` is a Server Component unless marked otherwise.
- Add `"use client"` at the top of a file only when it needs browser APIs, event handlers, useState, useEffect, or other client hooks.
- Keep client components small and push them to the leaves of the component tree.

## Metadata

Export a `metadata` object or `generateMetadata` function from `page.tsx` or `layout.tsx` for SEO:

```tsx
export const metadata: Metadata = {
  title: "Page Title",
  description: "Page description",
}
```

## Styling

- Use Tailwind CSS v4 utility classes directly in JSX.
- Theme variables are defined in `globals.css` using CSS custom properties (oklch color space).
- Use the `cn()` helper from `@/lib/utils` to merge conditional classes.

## Tests

- Test files go in `app/__tests__/` as `*.test.tsx`.
- Use React Testing Library's `render` for component tests.
