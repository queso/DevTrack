# DevTrack Deployment

## Overview

DevTrack deploys as a Next.js application backed by PostgreSQL. The target production environment is the arcane-k8s cluster at `devtrack.theaiteam.dev`, managed via ArgoCD GitOps. This document covers the full path from local Docker through production.

## Local Docker (Development)

The existing `docker-compose.yml` runs the dev server with hot reload:

```bash
docker compose up
```

- **App:** http://localhost:3000 (Next.js dev server with Turbopack)
- **Postgres:** localhost:5432 (user: `dev_track`, password: `dev_track`, db: `dev_track`)

Source code is bind-mounted, so changes reflect immediately.

### First Run

After containers are up, push the Prisma schema to the database:

```bash
docker compose exec app pnpm db:push
```

Optionally seed with sample data:

```bash
docker compose exec app pnpm db:seed
```

### Rebuilding

If dependencies change:

```bash
docker compose up --build
```

## Production Docker (Pre-K8s Testing)

Before deploying to the cluster, test a production build locally.

### Step 1: Add standalone output

Add `output: "standalone"` to `next.config.ts`:

```ts
const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["reactive-swr"],
  // ...
}
```

### Step 2: Production Dockerfile

Replace the current dev-only Dockerfile with a multi-stage build:

```dockerfile
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm db:generate && pnpm build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
EXPOSE 3000
CMD ["node", "server.js"]
```

### Step 3: Production docker-compose

Create `docker-compose.prod.yml`:

```yaml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://dev_track:dev_track@postgres:5432/dev_track
      SITE_URL: http://localhost:3000
      NODE_ENV: production
      LOG_LEVEL: info
    depends_on:
      postgres:
        condition: service_healthy

  postgres:
    image: postgres:17
    restart: unless-stopped
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: dev_track
      POSTGRES_PASSWORD: dev_track
      POSTGRES_DB: dev_track
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U dev_track"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
```

Test with:

```bash
docker compose -f docker-compose.prod.yml up --build
```

Verify the health endpoint responds:

```bash
curl http://localhost:3000/api/health
```

---

## Kubernetes (arcane-k8s)

Target: `devtrack.theaiteam.dev` on the OVH k3s cluster.

### Prerequisites

- Production Docker image pushed to `ghcr.io/queso/devtrack:latest`
- DNS record for `devtrack.theaiteam.dev` → `15.235.4.154` in Cloudflare (proxy enabled, SSL Full)

### Container Image CI

Add a GitHub Actions workflow to build and push on merge to `main`:

```yaml
# .github/workflows/docker.yml
name: Build and Push
on:
  push:
    branches: [main]
jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          push: true
          tags: ghcr.io/queso/devtrack:latest,ghcr.io/queso/devtrack:${{ github.sha }}
```

### Manifests to Create in arcane-k8s

All files go in the `arcane-k8s` repo:

#### ArgoCD Applications (`kubernetes/argocd/apps/`)

| File | Sync Wave | Purpose |
|------|-----------|---------|
| `devtrack-db.yaml` | 1 | CNPG PostgreSQL cluster for DevTrack |
| `devtrack.yaml` | 2 | DevTrack application deployment |

#### Database (`kubernetes/databases/devtrack-db/`)

| File | Purpose |
|------|---------|
| `cluster.yaml` | CNPG Cluster — deploys into `devtrack` namespace |
| `scheduled-backup.yaml` | B2 backup schedule |
| `networkpolicy.yaml` | Restrict DB access to devtrack namespace |

#### Application (`kubernetes/apps/devtrack/`)

| File | Purpose |
|------|---------|
| `deployment.yaml` | Deployment (image: `ghcr.io/queso/devtrack`) + Service (port 3000) |
| `ingress.yaml` | Traefik IngressRoute for `devtrack.theaiteam.dev` + TLS Certificate |
| `networkpolicy.yaml` | Namespace network restrictions |

#### Secrets (`kubernetes/secrets/sealed/`)

| File | Contents |
|------|----------|
| `devtrack-secrets.yaml` | `DEVTRACK_API_KEY`, `GITHUB_WEBHOOK_SECRET` |
| `b2-credentials-devtrack-db.yaml` | B2 backup credentials |

### Deployment Configuration

**Environment variables** in the Deployment:

| Variable | Source |
|----------|--------|
| `DATABASE_URL` | CNPG auto-generated secret `devtrack-db-app` (`uri` key) |
| `SITE_URL` | `https://devtrack.theaiteam.dev` |
| `CORS_ORIGIN` | `https://devtrack.theaiteam.dev` |
| `NODE_ENV` | `production` |
| `LOG_LEVEL` | `info` |
| `DEVTRACK_API_KEY` | SealedSecret `devtrack-secrets` |
| `GITHUB_WEBHOOK_SECRET` | SealedSecret `devtrack-secrets` |

**Probes:**

```yaml
livenessProbe:
  httpGet:
    path: /api/health
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 30
readinessProbe:
  httpGet:
    path: /api/health
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 10
```

**Database migration** — run as an init container using the same image:

```yaml
initContainers:
  - name: migrate
    image: ghcr.io/queso/devtrack:latest
    command: ["npx", "prisma", "migrate", "deploy"]
    env:
      - name: DATABASE_URL
        valueFrom:
          secretKeyRef:
            name: devtrack-db-app
            key: uri
```

### DNS

Add in Cloudflare:

| Type | Name | Value | Proxy |
|------|------|-------|-------|
| A | `devtrack.theaiteam.dev` | `15.235.4.154` | Yes |

SSL mode: Full.

---

## Checklist

### Phase 1: Local Production Docker
- [ ] Add `output: "standalone"` to `next.config.ts`
- [ ] Rewrite Dockerfile for multi-stage production build
- [ ] Create `docker-compose.prod.yml`
- [ ] Verify production build runs and `/api/health` responds

### Phase 2: Container Registry
- [ ] Add GitHub Actions workflow for GHCR push
- [ ] Verify image builds and pushes on merge to main

### Phase 3: Kubernetes
- [ ] Create ArgoCD Application definitions in arcane-k8s
- [ ] Create CNPG database cluster manifests
- [ ] Create Deployment, IngressRoute, NetworkPolicy manifests
- [ ] Seal secrets and commit to arcane-k8s
- [ ] Add Cloudflare DNS record
- [ ] Push arcane-k8s — ArgoCD auto-deploys
- [ ] Verify `https://devtrack.theaiteam.dev/api/health` responds
