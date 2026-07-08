# DevTrack — Deferred Findings

Issues found during the `revive/brief-integration` pass that were **noted but not
fixed** (out of scope for the agent-consumer status surface). Roughly ordered by
impact. Items marked ✅ were fixed in this branch and are listed for context.

## Fixed in this branch
- ✅ **No cross-project status surface.** Added `GET /api/v1/status/all` (Zod-validated, stable shape) — the machine-readable system-of-record for decker.
- ✅ **No local repo path on Project.** Added `Project.repoPath` + `repo_path` in the create/update Zod schemas, routes, and OpenAPI.
- ✅ **Git-hook event flow was broken against the current API.** The CLI/hook `event` command posts `project_name`, but `POST /api/v1/events` only accepted `project_id` (422). It also sends an empty title for `session-start` (failed `title.min(1)`). The events endpoint now resolves `project_name`→id and backfills a title from the event type.
- ✅ **Events never advanced `lastActivityAt`.** Staleness/activity tracking was inert. `POST /events` now advances the project's `lastActivityAt` (monotonically) so staleness is real.
- ✅ **CLI / hook auth env var name mismatch.** The Go CLI read the key from `DEVTRACK_TOKEN` while every doc said `DEVTRACK_API_KEY`, so docs-following hook calls 401'd. The CLI now reads `DEVTRACK_API_KEY` as the canonical name (resolved centrally in `cmd/root.go`), falls back to `DEVTRACK_TOKEN` with a deprecation warning, and the docs/error messages were unified on `DEVTRACK_API_KEY`.

## Deferred (not fixed)

### Content pipeline is half-migrated
- `ContentItem` is documented (`docs/API.md`) and wired into the CLI (`ideas`, `sync` content) but **does not exist in `prisma/schema.prisma`**. Any CLI content command will fail against the API.
- `prd/005-unified-document-model.md` is uncommitted in the working tree — the document-model refactor was in flight when work stopped. This is the most likely proximate cause of the stall.
- **Recommendation:** either finish PRD 005 (unify PRD + ContentItem into a Document model) or explicitly cut content features for now. Not needed for the decker brief.

### CLI doesn't send Cloudflare Access service-token headers ⚠️ first post-deploy follow-up
- Production (`devtrack.theaiteam.dev`, arcane-k8s PR #6) sits behind a Cloudflare
  Zero Trust Access application (kanban-viewer internal posture). Non-browser
  clients must send `CF-Access-Client-Id` / `CF-Access-Client-Secret` headers;
  the Go CLI (and therefore every git/Claude hook event post from dev machines)
  doesn't, so those calls are blocked by Access the moment the app goes live.
- **Recommendation:** copy the `ateam` CLI's CF service-token pattern (env-var
  pair + headers on every request) into `cli/` — resolved centrally in
  `cmd/root.go` next to the API-key handling. Local dev (`localhost:3000`) is
  unaffected.

### `project.yaml` manifest can't carry `repo_path`
- `cli/internal/manifest.go` `Manifest` struct has no `repo_path` (or `owner`) field, so `devtrack register` / hooks can't populate the new `Project.repoPath` — only a direct API `POST/PATCH` can. **Recommendation:** add `repo_path` to the manifest and to `register`'s body mapping (and have `register` default it to the repo's absolute path).

### Doc/impl mismatches
- `docs/API.md` says `POST /prds/:id/work-items` accepts an **array**; the route accepts a **single object**. Either doc or route should change.
- `GET /projects/:id/status` resolves the project by **UUID only**, while the other `projects/:id/*` routes accept **name-or-UUID** (`projectWhere`). Inconsistent; `/status/all` sidesteps this by returning everything.
- `.env.example` omits `DEVTRACK_API_KEY` / `NEXT_PUBLIC_DEVTRACK_API_KEY`, though the app requires them for `/api/v1/*` auth.

### Local dev / infra
- A stale **`devtrack-app-1`** container has been crash-looping for ~3 months (`Command "dev" not found`) — its image predates the plugin restructure that moved the app into `web/`. Harmless but noisy. **Recommendation:** `docker rm -f devtrack-app-1`.
- `web/docker-compose.yml` carries OVH/Traefik production labels and an external `traefik_default` network, so it's not a clean "just run it locally" file. This pass runs the Next.js dev server directly on the host against the existing `devtrack-postgres-1` container instead. **Recommendation:** add a minimal `docker-compose.local.yml` (Postgres + app, no Traefik).
- **No Prisma migration files** — the project uses `prisma db push`. README's `prisma migrate deploy` step will no-op/fail (no `migrations/` dir). Fine for dev; unmanaged for prod schema drift.

### Webhook secret
- `lib/env.ts` defines `GITHUB_WEBHOOK_SECRET`, but `docs/ARCHITECTURE.md`/`API.md` say GitHub signatures are validated against `DEVTRACK_API_KEY`. Not deeply verified this pass — worth confirming which secret the webhook route actually uses before relying on webhooks.

### CSP has no nonce plumbing — production allows 'unsafe-inline'
- The production CSP originally shipped `script-src 'self'` with no nonces, which
  blocks Next.js's inline bootstrap scripts — the dashboard never hydrated on the
  first OVH deploy (infinite spinner; 6× "Refused to execute a script" in console).
  Hotfixed by allowing `'unsafe-inline'` in production (acceptable behind
  Cloudflare Access + API key). **Recommendation:** implement per-request nonces
  in middleware (Next.js app router picks the nonce up from the CSP request
  header) and tighten back to `script-src 'self' 'nonce-…'`.

### Minor
- Biome: 20 pre-existing `noExplicitAny` warnings, all in test files. 0 errors.
- Dashboard client-side `mapProject` duplicates some derivation now centralized in `/status/all`; could converge later.
