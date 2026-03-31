# lib/ -- Shared Utilities and Patterns

This directory contains shared code used across the application.

## Key Files

- `db.ts` -- Prisma client singleton. Always import `prisma` from `@/lib/db` instead of creating new instances. The singleton prevents connection exhaustion during development hot reloads.
- `utils.ts` -- Contains the `cn()` function for merging Tailwind CSS classes (uses clsx + tailwind-merge).
- `generated/prisma/` -- Auto-generated Prisma client. Do not edit. Regenerate with `pnpm db:generate`.

## Conventions

- Keep functions pure where possible. Side effects should be explicit and documented.
- Use the `@/lib/` path alias for imports.
- shadcn/ui expects utilities at `@/lib/utils` -- do not move the `cn()` function.
- New shared helpers and utility functions go in this directory.
