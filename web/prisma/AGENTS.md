# prisma/ -- Database Schema and Migrations

## Source of Truth

`schema.prisma` defines the database schema. The database is PostgreSQL.

The Prisma client is generated to `lib/generated/prisma/` (configured in `prisma.config.ts` and the generator block in `schema.prisma`).

## Workflow

1. Edit `schema.prisma` to add or modify models.
2. Run `pnpm db:migrate` to create a migration and apply it.
3. Run `pnpm db:generate` to regenerate the Prisma client.

Use `pnpm db:push` for quick prototyping (pushes schema changes without creating a migration file).

## Conventions

- Keep models clean with clear field names.
- Use `@id` with `@default(autoincrement())` or `@default(uuid())` for primary keys.
- Add `@map` and `@@map` annotations if table/column names should differ from model/field names.
- The `DATABASE_URL` environment variable configures the connection (see `.env.example`).
- Use `pnpm db:studio` to browse data in a GUI during development.
