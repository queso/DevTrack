# DevTrack → Reveille Brief Integration

DevTrack is the **machine-readable system of record** for multi-repo development
state. This document is the contract for the [reveille](../../TheAITeam/reveille)
morning-brief collector, whose consumer is an **agent**, not a human dashboard.

The single surface the collector needs is:

```
GET /api/v1/status/all
```

It returns, for every registered project: identity, local repo path, SDLC state,
staleness, the active PRD (with progress), the open-PR queue, and the last
recorded event. One call, no pagination, stable shape.

---

## 1. Endpoint

| | |
|---|---|
| **Method / path** | `GET /api/v1/status/all` |
| **Auth** | `Authorization: Bearer <DEVTRACK_API_KEY>` **or** `X-Api-Key: <DEVTRACK_API_KEY>` |
| **Base URL (local)** | `http://localhost:3000/api/v1` |
| **Response** | `200` with `{ "data": StatusAll }` (standard envelope; no `meta`) |
| **Errors** | `401` `{ "error": "UNAUTHORIZED", "message": ... }` |

The response is validated server-side against `statusAllResponseSchema`
(`web/lib/schemas/index.ts`) before it is returned — the shape below is
guaranteed, not best-effort. It is also described in the OpenAPI spec
(`GET /api/v1/openapi.json` → `#/components/schemas/StatusAll`).

### Example

```bash
curl -s -H "X-Api-Key: $DEVTRACK_API_KEY" \
  http://localhost:3000/api/v1/status/all
```

```json
{
  "data": {
    "generated_at": "2026-07-07T17:06:56.942Z",
    "project_count": 3,
    "projects": [
      {
        "id": "26fc8599-44cb-4879-8ee9-12a27eefccfd",
        "name": "conduit",
        "domain": "opensource",
        "workflow": "sdlc",
        "repo_path": "/home/josh/Code/OpenSource/conduit",
        "repo_url": "https://github.com/theaiteam-dev/conduit-harness",
        "main_branch": "main",
        "sdlc_state": "building",
        "staleness": "active",
        "last_activity_at": "2026-07-07T17:06:24.000Z",
        "days_since_activity": 0,
        "last_event": {
          "type": "commit",
          "title": "harness worker PRD promoted to ready",
          "occurred_at": "2026-07-07T17:06:24.000Z"
        },
        "active_prd": {
          "id": "22f1818c-0f05-4106-b078-55927e0b0956",
          "title": "Agentic harness worker",
          "summary": "Background worker that executes agentic harness runs",
          "source_path": "prd/001-harness-worker.md",
          "status": "in_progress",
          "work_items_total": 3,
          "work_items_done": 1,
          "progress": 0.33
        },
        "prd_counts": { "queued": 0, "in_progress": 1, "completed": 0 },
        "open_prs": {
          "count": 1,
          "items": [
            {
              "number": 7,
              "title": "feat: worker loop + job queue",
              "url": "https://github.com/theaiteam-dev/conduit-harness/pull/7",
              "status": "open",
              "check_status": "passing",
              "author": "josh",
              "opened_at": "2026-07-07T15:00:00.000Z"
            }
          ]
        }
      }
    ]
  }
}
```

(An idle project — no active PRD, no open PRs — has `sdlc_state: "idle"`,
`active_prd: null`, and `open_prs.count: 0`.)

---

## 2. Field contract

### `data`
| Field | Type | Notes |
|---|---|---|
| `generated_at` | ISO-8601 string | Server time the response was built. |
| `project_count` | integer | `projects.length`. |
| `projects` | `ProjectStatus[]` | Sorted by `name` ascending. |

### `ProjectStatus`
| Field | Type | Meaning |
|---|---|---|
| `id` | uuid | DevTrack project id. |
| `name` | string | Unique project name (also the CLI/hook key). |
| `domain` | string \| null | Grouping domain (e.g. `opensource`, `theaiteam`). |
| `workflow` | string | Currently always `"sdlc"`. |
| `repo_path` | string \| null | **Absolute local filesystem path** — how the collector correlates a DevTrack project to a repo on disk. |
| `repo_url` | string \| null | Canonical remote (https). |
| `main_branch` | string | Trunk branch. |
| `sdlc_state` | enum | Quick triage — see below. |
| `staleness` | enum | Activity bucket — see below. |
| `last_activity_at` | ISO-8601 \| null | **Effective** last activity = max(stored marker, latest event). |
| `days_since_activity` | integer \| null | Whole days since `last_activity_at`; `null` if never active. |
| `last_event` | object \| null | `{ type, title, occurred_at }` of the most recent event. |
| `active_prd` | object \| null | The single `in_progress` PRD, if any (below). |
| `prd_counts` | object | `{ queued, in_progress, completed }` counts. |
| `open_prs` | object | `{ count, items[] }` — PRs not merged/closed. |

### `sdlc_state` (mutually exclusive, in priority order)
| Value | Condition | Agent reading |
|---|---|---|
| `building` | an `in_progress` PRD exists | work actively in flight |
| `reviewing` | no active PRD, but open PRs exist | waiting on review/merge |
| `planned` | queued PRD(s), nothing in progress, no open PRs | ready to start |
| `idle` | none of the above | nothing queued or in flight |

### `staleness` (independent of `sdlc_state`)
| Value | `days_since_activity` |
|---|---|
| `active` | `< 1` |
| `recent` | `< 7` |
| `aging` | `< 14` |
| `stale` | `>= 14`, or never active (`null`) |

> **The two axes are orthogonal on purpose.** `building` + `stale` = *stalled
> work that needs a nudge* — exactly the signal a morning brief should surface.
> Don't collapse them into one field.

### `active_prd`
`{ id, title, summary, source_path, status, work_items_total, work_items_done,
progress }`, where `progress` is `work_items_done / work_items_total` rounded to 2
decimals (`0` when there are no work items). `source_path` is the PRD's path in
the repo, so the collector can open the file from `repo_path + "/" + source_path`.

### `open_prs.items[]`
`{ number, title, url, status, check_status, author, opened_at }`. `status` is one
of `open | draft | review_requested | changes_requested | approved` (everything
except `merged`/`closed`). `check_status` is `pending | passing | failing | null`.

---

## 3. How the collector should call it

```python
import os, requests

DEVTRACK = os.environ.get("DEVTRACK_API_URL", "http://localhost:3000/api/v1")
KEY = os.environ["DEVTRACK_API_KEY"]

def fetch_devtrack_status():
    r = requests.get(
        f"{DEVTRACK}/status/all",
        headers={"X-Api-Key": KEY},
        timeout=5,
    )
    r.raise_for_status()
    return r.json()["data"]["projects"]

def needs_attention(p):
    # stalled work, failing checks, or a PR waiting on the human
    if p["sdlc_state"] == "building" and p["staleness"] in ("aging", "stale"):
        return "stalled: active PRD but no recent activity"
    for pr in p["open_prs"]["items"]:
        if pr["check_status"] == "failing":
            return f"PR #{pr['number']} checks failing"
        if pr["status"] in ("review_requested", "changes_requested"):
            return f"PR #{pr['number']} awaiting you"
    return None
```

Guidance:
- **One request per brief.** No pagination; the whole fleet comes back at once.
- **Correlate by `name`** (stable) or `repo_path` (to match on-disk repos). Avoid keying on `id`.
- **Treat unknown fields as additive.** New optional fields may appear; the four `sdlc_state` / `staleness` enum values are stable. Don't hard-fail on an unrecognized enum — bucket it as "other".
- **Timeouts / offline:** if the server is down, the collector should degrade to the static fallback (§4), not error the whole brief.

---

## 4. Server-required vs. readable statically

**Requires the DevTrack server (+ Postgres) running:**
- `GET /api/v1/status/all` and every other `/api/v1/*` endpoint. The aggregated
  status, staleness, PR queue, event history, and PRD progress live in Postgres
  and are only exposed through the API.

**Readable statically from each repo, no server:**
- `project.yaml` at a repo root — name, domain, `repo_url`, `main_branch`, `prd_path` (the manifest the hooks/CLI use to register).
- The PRD markdown under `prd_path` (e.g. `prd/*.md`) — titles, summaries, work items — parseable directly (`web/lib/prd-parser.ts` shows the format).
- `git` itself — current branch, last commit, dirty state.

**Implication for reveille:** the *rich, cross-project, time-aware* view
(staleness, "stalled work", the PR queue, last event) needs DevTrack running.
The collector should start the server (or assume it's up) for the full brief, and
fall back to static `project.yaml` + PRD parsing + `git` for a degraded brief when
DevTrack is unreachable. See [`running-locally`](#running-locally) in the README
for how to bring the server up.

---

## 5. Keeping the data fresh

`/status/all` only reflects what has been recorded. Freshness comes from:
- **Git hooks** (`hooks/hooks.json`) posting `commit` / `session-start` /
  `session-end` events via `devtrack event` → `POST /api/v1/events`. Each event
  now advances the project's `last_activity_at`, which drives `staleness`.
- **PR sync** (`devtrack sync` / GitHub webhooks) updating the PR queue.
- **PRD sync** creating/updating PRDs and work items.

If a project shows `stale` but you know it's active, its events aren't reaching
DevTrack — check `DEVTRACK_API_URL` and the API key env var (see the CLI auth note
in `FINDINGS.md`: the CLI currently reads `DEVTRACK_TOKEN`, not `DEVTRACK_API_KEY`).
