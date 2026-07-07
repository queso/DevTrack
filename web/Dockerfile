# Production image for the DevTrack Next.js app (web/).
#
# Multi-stage: a full-toolchain builder (Prisma generate + `next build`) and a
# lean runner. The same image is reused as a migrate initContainer in k8s
# (`pnpm exec prisma migrate deploy`) — see kubernetes/apps/devtrack in the
# arcane-k8s repo. Prisma v7 talks to Postgres through @prisma/adapter-pg at
# runtime, so no query-engine binary is needed by the server; the `prisma` CLI
# (a devDependency, present here) still runs migrations at deploy time.
#
# Debian slim (not alpine) so the Prisma migration engine's OpenSSL 3 linkage
# resolves without musl workarounds.
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ── Builder: install everything, generate the Prisma client, build Next ──
FROM base AS builder
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# NEXT_PUBLIC_* are inlined at build time. The dashboard's browser-side SWR
# fetcher authenticates with NEXT_PUBLIC_DEVTRACK_API_KEY; leave it empty for a
# server-only/decker deploy (the API itself authenticates server-side against
# the runtime DEVTRACK_API_KEY secret). Pass --build-arg to enable the browser UI.
ARG NEXT_PUBLIC_DEVTRACK_API_KEY=""
ENV NEXT_PUBLIC_DEVTRACK_API_KEY=$NEXT_PUBLIC_DEVTRACK_API_KEY
# `next build` collects page data, which evaluates modules that construct the
# Prisma client and assert DATABASE_URL is set. It never connects at build time,
# so a throwaway placeholder satisfies the check; the real URL is injected at
# runtime from the CNPG-generated secret.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN pnpm db:generate && pnpm build

# ── Runner: prod runtime with the Prisma CLI available for migrations ──
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
# Copy the built app and its node_modules (kept whole so the `prisma` CLI is
# present for `migrate deploy`; image-size trimming is a follow-up).
COPY --from=builder /app ./
EXPOSE 3000
CMD ["pnpm", "start"]
