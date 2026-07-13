---
missionId: ~
---

# SSE Live Updates with Change Highlighting

**Author:** Josh Owens  **Date:** 2026-07-12  **Status:** Draft

## 1. Context & Background

DevTrack is mission control for multi-repo development. As of this week, tracking is truly box-wide: plugin hooks report session starts, tool use, commits, and pushes from every repo on the machine, and the credential chain works from any launch context. Event volume went from a trickle to a steady stream — the dashboard is finally worth keeping open on a second monitor.

But the dashboard doesn't feel alive. Data refreshes on a 30-second SWR poll, and when a poll lands, rows change silently — there is no way to tell whether the data is current, stale, or updating at all. The client-side foundation for live updates was already laid (`reactive-swr` is installed, the app's provider tree supports an SSE configuration, tests cover the plumbing) but the work stopped before the server half: no stream endpoint exists and the provider is never enabled. The README already advertises "SWR + reactiveSWR" — this PRD closes the gap between what's claimed and what's real.

## 2. Problem Statement

Dashboard data only updates on a 30-second poll, and updates render invisibly — a user watching the dashboard cannot tell that a commit just landed, a PR just merged, or an agent session just started. This undermines the core promise of a mission-control tool: confidence that what you see is what's happening right now.

## 3. Target Users & Use Cases

**Primary users:**
- **Josh (solo operator)** — keeps the DevTrack dashboard open while working and while agents run; wants to glance over and see activity as it happens.
- **Future team/demo viewers** — anyone shown the dashboard should immediately perceive it as live.

**Key use cases:**
- A user watching the timeline needs new events to appear within seconds of the underlying activity, so they can trust the dashboard over checking terminals.
- A user glancing at the dashboard needs newly arrived or changed rows to be visually distinct for a moment (highlight that fades), so changes register in peripheral vision.
- A user on an unreliable connection needs the dashboard to recover automatically and backfill anything missed, so a dropped stream never means silently frozen data.

## 4. Goals & Success Metrics

| Goal | Metric | Target |
|------|--------|--------|
| Updates feel instant | Time from event write (API accepts POST) to visible row in an open dashboard | ≤ 2 seconds |
| Changes are noticeable | New/updated rows render with a highlight that fades | 100% of live-arriving rows on covered surfaces |
| Less background traffic | SWR polling requests while the stream is healthy | 30s polling eliminated or reduced to a slow safety-net interval |
| Resilience | Recovery after a dropped connection (reconnect + data backfill) | Automatic, no user action, no permanently missed updates |

## 5. Scope

### In Scope
- A server-sent events stream from the DevTrack API that announces creations/updates to events, pull requests, PRDs/work items, and projects.
- Enabling the existing (currently dormant) SSE provider in the web app, mapping pushed changes to the SWR caches that back the dashboard, timeline, and project detail pages.
- A visual "new/changed" highlight: rows that arrive or change via a live update render with a single theme-aware accent tint that fades over ~2 seconds. Applies to the timeline feed, dashboard summary cards/lists, and the project detail activity list. The existing event-type column carries type meaning, so the highlight itself is one consistent accent (not color-coded per type).
- A live-connection indicator rendered as a small state dot ("Live" / "Polling") in the sidebar footer, visible on every page.
- Automatic reconnection with backoff, and revalidation of visible data after reconnect so missed changes are backfilled.
- Graceful degradation: when the stream is unavailable (old browser, proxy trouble, endpoint down), the app behaves exactly as today (30s polling).
- Authentication for the stream consistent with the rest of the API (Cloudflare Access in production, API key locally).

### Out of Scope
- WebSockets or bidirectional messaging — one-way server push is sufficient.
- Browser/PWA push notifications (existing issue #1; separate PRD).
- Multi-replica fan-out infrastructure (message bus, Postgres LISTEN/NOTIFY). The deployment runs a single app replica today; the design should not preclude it, but building it is deferred.
- Streaming to the CLI or other machine clients — browser dashboard only.
- Historical event replay through the stream (reconnect backfill is via normal API revalidation, not stream replay).

## 6. Requirements

### Functional Requirements

1. When an event, pull request, PRD/work item, or project is created or updated through the API, every connected dashboard shall reflect the change within 2 seconds, without user action.
2. Rows that appear or change due to a live update shall render with a highlight tint that fades out over roughly 2 seconds, on the timeline, dashboard, and project detail surfaces.
3. Rows present at initial page load shall NOT render the highlight — only changes that arrive while the page is open.
4. The client shall automatically reconnect after a dropped stream using backoff, and shall revalidate affected data on reconnect so changes that occurred while disconnected appear (without highlights being replayed for the full backfill set... a burst of backfilled rows may highlight as one batch, but must not animate row-by-row over a long period).
5. The app shall expose a lightweight connection state ("live" vs "polling") visible in the UI.
6. When the stream is unavailable or unsupported, the app shall fall back to the current 30-second polling behavior with no functional regression.
7. The stream shall enforce the same authentication as the rest of the `/api/v1` surface — Cloudflare Access identity in production, API key in local development. An unauthenticated stream request shall be rejected.
8. Users with reduced-motion preference shall not see the fade animation (rows may use a static, non-animated affordance or none at all).

### Non-Functional Requirements

1. The stream shall survive the production edge (Cloudflare + Traefik): heartbeats shall keep idle connections alive, and a proxy-severed connection shall be indistinguishable from any other disconnect (triggering reconnection).
2. The server shall clean up disconnected clients promptly — an open-then-abandoned dashboard tab shall not leak server resources.
3. High-frequency bursts (e.g., an agent emitting many tool_use events per minute) shall not cause UI thrash. This shall be handled at two layers: the server shall coalesce stream announcements per project (at most one announcement per project per ~2 seconds), and the client shall batch the resulting cache invalidations. Sub-second granularity for tool_use specifically is explicitly acceptable to sacrifice; commits, PRs, PRD, session, and project changes are lower-frequency and are not expected to be throttled in practice.
4. One browser tab shall hold at most one stream connection, shared across all pages/components in that tab.
5. The feature shall not weaken the existing security posture: no API key may be exposed to the browser in production to make the stream work.

### Edge Cases & Error States

- Server restarts or redeploys mid-stream → clients reconnect and backfill; no error surfaced to the user beyond the connection indicator flipping.
- Cloudflare's connection duration limits terminate long-lived streams → treated as a normal disconnect/reconnect cycle.
- A burst of events lands while the tab is backgrounded → on tab focus, data is current (or refreshes immediately); no unbounded animation queue plays back.
- An event arrives for a project the current view filters out → no visible change, no phantom highlight, and caches for other views stay correct.
- Multiple tabs open → each behaves correctly and independently; total connection count stays proportional to tabs.
- The stream endpoint errors immediately (e.g., misconfiguration) → app silently stays on polling; no error wall.

## 9. Technical Considerations

**Constraints:**
- Production sits behind Cloudflare Zero Trust Access; browsers authenticate via the Access cookie/JWT. The browser's native EventSource API cannot set custom headers, so local-dev API-key auth for the stream needs a header-free mechanism — this constraint must not lead to shipping an API key in the public bundle (NFR 5).
- The deployed app runs on Kubernetes behind Traefik; response buffering and idle timeouts along that path must accommodate long-lived streaming responses.
- `reactive-swr` is pinned at 0.2.0, a pre-1.0 package with a locally maintained type shim (`web/types/reactive-swr.d.ts`). Its actual runtime API must be validated against the shim before the client work builds on it.

**Dependencies:**
- None external. Internal: the existing SWR hooks (`web/lib/hooks.ts`), the provider tree (`web/app/providers.tsx`), and API route handlers that write events/PRs/projects (which must announce changes to the stream).

**Integration points:**
- API write paths (events, PRs, PRDs/work items, projects, GitHub webhooks) → stream announcements.
- SWR cache keys used by dashboard, timeline, and project detail pages → invalidation mappings.
- Tailwind/shadcn theming → highlight tint must respect light/dark themes.

## 10. Risks & Open Questions

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Edge/proxy (Cloudflare, Traefik) buffers or kills SSE responses | Medium | Feature dead in prod while fine locally | Heartbeats, verify against prod path early (spike first), fall back to polling automatically |
| `reactive-swr@0.2.0` API doesn't match the local type shim or has gaps | Medium | Client wiring stalls or needs a different library | Validate the package against the shim as the first work item; be ready to invalidate via plain SWR `mutate` instead |
| Event bursts cause render thrash or highlight spam | Medium | Dashboard feels worse, not better | Coalesce invalidations; batch highlights; cap animation frequency |
| In-memory announcement of changes misses writes if app scales to >1 replica | Low (single replica today) | Some clients miss updates until next revalidate | Documented limitation + safety-net slow poll; LISTEN/NOTIFY deferred |
| Next.js App Router streaming quirks in dev (Turbopack) differ from prod | Low | Confusing dev experience | Verify in both `pnpm run dev` and the production Docker image |

### Resolved Decisions
- **Burst control:** Server throttles stream announcements per project (~1 per 2s) AND the client coalesces invalidations. tool_use is the only signal fast enough to hit the throttle; losing its sub-second granularity is acceptable.
- **Connection indicator:** A single "Live" / "Polling" state dot in the sidebar footer — one implementation site, visible on every page.
- **Highlight styling:** One theme-aware accent tint fading over ~2s for all live-arriving rows; the event-type column already conveys type, so no per-type color coding.

### Open Questions
- None outstanding — the three discovery questions above are resolved.
