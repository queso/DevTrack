# PRD 006: Agent Remote Control

## Summary

Let users monitor and command Claude Code agents from the DevTrack dashboard when they're away from the terminal. When Claude stops (hits a blocker, finishes a task, needs input), a Stop hook posts context to DevTrack and keeps Claude alive by blocking the stop. The user sees the pause on their phone, types a response in the dashboard, and Claude picks it up via polling — all while the terminal stays live for the user to walk up and take over directly.

## Problem

Claude Code agents stop when they hit blockers, finish tasks, or need human input. If the developer is away from the terminal (on their phone, in a meeting, at lunch), the agent just sits there stopped until someone comes back to the keyboard. There's no way to:

- Know that the agent stopped (without checking the terminal)
- See _why_ it stopped (without reading the terminal output)
- Send it new instructions remotely
- Keep it productive while you're away

DevTrack already tracks project state and surfaces it in a dashboard. The missing piece is bidirectional communication between the dashboard and running Claude Code sessions.

## Architecture

### Core Flow

```
Developer's Laptop                          DevTrack Server                    Developer's Phone
─────────────────                          ──────────────                     ─────────────────

Claude finishes work
  → tries to stop
  → Stop hook fires
  → devtrack agent-pause               →  POST /agent-sessions
     (posts context)                       (stores pause context)        →  Dashboard shows:
                                                                            "Agent paused:
  → hook polls for response             ← GET /agent-sessions/:id/poll      needs approval for
     (30s timeout)                                                           DB migration"
  → no response yet
  → blocks stop with reason                                                 User types response
  → Claude stays alive                                                      "go ahead, use
                                                                             staging DB"
Claude sees "waiting" reason                                             →  POST /agent-sessions
  → tries to stop again                                                     /:id/respond
  → Stop hook fires again
  → hook polls                          ← GET /agent-sessions/:id/poll
  → response found!                        (returns user message)
  → blocks stop with user's message
  → Claude acts on it

Meanwhile: terminal is live,
user can walk up and type directly
```

### Components

**1. Stop Hook (`devtrack-agent-hook.sh`)**

Shell script registered as a Claude Code Stop hook. Responsibilities:
- On first fire (`stop_hook_active: false`): post session context to DevTrack API
- On every fire: poll DevTrack for a user response
- If response exists: return `{"decision": "block", "reason": "<user's message>"}` — Claude continues with the instruction
- If no response: return `{"decision": "block", "reason": "Waiting for input via DevTrack dashboard."}` — Claude stays alive
- Use exponential backoff on poll timeout to minimize token burn

**2. CLI Commands**

New convenience commands for the `devtrack` CLI:

```bash
# Post an agent pause (called by the hook)
devtrack agent-pause \
  --session-id $SESSION_ID \
  --context "last assistant message / what happened" \
  --project-yaml ./project.yaml

# Poll for a response (called by the hook)
devtrack agent-poll \
  --session-id $SESSION_ID \
  --timeout 30

# List active agent sessions (for debugging)
devtrack agent-sessions
```

**3. API Endpoints**

```
POST   /agent-sessions                    # Create a pause record
GET    /agent-sessions/:id/poll           # Long-poll for user response (returns when response exists or timeout)
POST   /agent-sessions/:id/respond        # Submit user response (from dashboard)
GET    /agent-sessions                    # List active sessions (filterable by project)
PATCH  /agent-sessions/:id               # Update session (mark resolved, add notes)
DELETE /agent-sessions/:id               # Close a session
```

**4. Data Model**

```
AgentSession
├── id (uuid)
├── projectId (fk -> Project)
├── sessionId (string) — Claude Code session ID
├── status (string) — "waiting", "responded", "resolved", "expired"
├── context (text) — Claude's last message / why it stopped
├── response (text?) — user's response from dashboard
├── respondedAt (datetime?)
├── expiresAt (datetime?) — auto-expire after configurable TTL
├── metadata (json?) — hook input data, environment info
├── createdAt, updatedAt
```

**5. Dashboard UI**

New section on the project page (and/or a global view):

- **Active agent sessions** — cards showing paused agents with context
- **Response input** — text field to type a response, sends to `POST /agent-sessions/:id/respond`
- **Session history** — collapsed list of resolved sessions
- **Status indicators** — "Waiting" (pulse animation), "Responded" (green check), "Expired" (grey)
- **Mobile-friendly** — this is the primary use case (user on phone)

### Exponential Backoff Strategy

The hook increases its poll timeout to reduce token burn while Claude is idle:

| Wait Duration | Poll Timeout | Cycles/Hour | Purpose |
|---------------|-------------|-------------|---------|
| 0–30s         | 15s         | —           | Catch immediate responses |
| 30s–90s       | 30s         | —           | Short wait |
| 90s–210s      | 60s         | —           | Medium wait |
| 210s–450s     | 120s        | —           | Longer wait |
| 450s+         | 300s        | ~12         | Steady state (5 min cap) |

At steady state with a 5-minute poll cycle, Claude does ~12 idle cycles per hour. Each cycle:
- Stop hook blocks → Claude reads reason → Claude outputs minimal response → tries to stop → hook fires again
- Token cost: conversation context (input) + minimal output per cycle

To minimize output tokens, the hook's "waiting" reason instructs Claude to respond minimally:

```
"reason": "No dashboard input yet. Reply with only '⏳' and stop."
```

### Token Cost Management

The main cost concern is input tokens — each cycle re-reads the full conversation. Mitigation strategies:

- **Exponential backoff** reduces cycle frequency (12/hour at steady state vs 120+/hour without)
- **Minimal output instruction** keeps output tokens near zero per cycle
- **Max wait TTL** — auto-expire sessions after a configurable period (default: 2 hours). After expiry, allow the stop. Prevents forgotten sessions from burning tokens indefinitely.
- **Context compaction** — Claude's built-in context compaction keeps the transcript manageable over long waits

### Hook Configuration

Installed via `devtrack hooks install` alongside existing git hooks:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "devtrack agent-hook stop",
            "timeout": 330,
            "statusMessage": "Checking DevTrack for remote input..."
          }
        ]
      }
    ]
  }
}
```

The hook timeout (330s) must exceed the max poll timeout (300s) with buffer. Configurable per-project.

### Long-Poll vs Short-Poll

The `GET /agent-sessions/:id/poll` endpoint uses **HTTP long-polling**:

- Client sends request with `?timeout=30` (or whatever the current backoff timeout is)
- Server holds the connection open until either:
  - A response is submitted → returns the response immediately
  - Timeout expires → returns empty 204
- This avoids wasted requests when no response exists and delivers responses with near-zero latency

### Safety

- **`stop_hook_active` handling**: The hook ignores this flag intentionally (we want to keep blocking). But we track our own cycle count and respect the max wait TTL.
- **Max wait TTL**: Default 2 hours. After this, the hook allows the stop regardless. Prevents runaway token burn.
- **User can always type locally**: The terminal is live. Typing in Claude takes precedence — the hook only matters when Claude tries to stop on its own.
- **Graceful expiry**: When TTL expires, the hook posts a final update to DevTrack ("session expired, agent stopped") so the dashboard reflects reality.

## CLI Changes

### New Commands

```bash
devtrack agent-pause       # Post pause context (used by hook)
devtrack agent-poll        # Poll for response (used by hook)
devtrack agent-hook stop   # Combined hook handler (pause + poll in one)
devtrack agent-sessions    # List active sessions (debugging/admin)
```

### Hook Installer Update

`devtrack hooks install` gains a `--claude-code` flag (or auto-detects) to install the Stop hook into Claude Code's settings alongside the existing git hooks.

## Dashboard Changes

### Project Page

New "Agent Activity" section:

```
┌─────────────────────────────────────────────┐
│ 🤖 Agent Activity                           │
│                                             │
│ ⏳ Waiting for input (3 min ago)            │
│ "I've finished implementing the auth flow   │
│  but the migration needs approval before    │
│  I can run it against staging."             │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ Go ahead, run the migration. Use the   │ │
│ │ staging credentials from .env.staging   │ │
│ └─────────────────────────────────────────┘ │
│                          [Send Response]     │
│                                             │
│ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │
│ ✓ Resolved (2 hours ago)                    │
│   "Need guidance on error handling..."      │
│   → "Use retry with exponential backoff"    │
└─────────────────────────────────────────────┘
```

### Global Agent View

Optional top-level "Agents" page showing all active sessions across projects. Useful when managing multiple agents.

## Installation & Setup

### Prerequisites

- DevTrack server deployed and accessible (e.g., `https://devtrack.example.com`)
- Go toolchain installed (for building the CLI)
- Claude Code installed on the developer's machine

### Step 1: Install the CLI

```bash
# From source
cd cli && go install .

# Or download a prebuilt binary (future)
# curl -sL https://devtrack.example.com/install.sh | sh
```

### Step 2: Configure API connection

```bash
devtrack config set api-url https://devtrack.example.com
devtrack config set token <your-api-token>

# Verify connectivity
devtrack api-health get-health
```

The config is stored at `~/.devtrack/config.yaml`:

```yaml
api_url: https://devtrack.example.com
token: dt_abc123...
```

### Step 3: Install hooks

```bash
# Install git hooks (project-level, existing behavior)
cd ~/Code/my-project
devtrack hooks install

# Install Claude Code Stop hook (global, new)
devtrack hooks install --claude-code
```

The `--claude-code` flag:

1. Checks `devtrack` is on `$PATH`
2. Reads `~/.claude/settings.json` (creates if missing)
3. Merges the Stop hook entry — preserves existing hooks, doesn't overwrite
4. Writes back the updated settings

```json
// Added to ~/.claude/settings.json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "devtrack agent-hook stop",
            "timeout": 330,
            "statusMessage": "Checking DevTrack for remote input..."
          }
        ]
      }
    ]
  }
}
```

Claude Code auto-detects settings changes — no restart needed.

### Step 4: Verify

```bash
# Check Claude Code sees the hook
# (user runs /hooks inside Claude Code to inspect)

# Test the hook manually
echo '{"session_id":"test","stop_hook_active":false,"last_assistant_message":"test"}' | devtrack agent-hook stop
```

### Uninstall

```bash
# Remove Claude Code Stop hook
devtrack hooks uninstall --claude-code

# Remove git hooks (existing behavior)
devtrack hooks uninstall
```

`--claude-code` uninstall reads `~/.claude/settings.json`, removes only the DevTrack Stop hook entry, and preserves everything else.

### Multi-Machine Setup

The CLI + hook install is per-machine. For developers with multiple workstations:

```bash
# On each machine:
go install .
devtrack config set api-url https://devtrack.example.com
devtrack config set token <your-api-token>
devtrack hooks install --claude-code
```

The DevTrack server is shared — agent sessions from any machine show up in the same dashboard. The `sessionId` field on `AgentSession` includes enough context (machine hostname, project path) to distinguish sessions across machines.

## What We Build

- `AgentSession` Prisma model and migration
- 5 API endpoints (CRUD + poll)
- `devtrack agent-hook` CLI command (combined pause + poll)
- `devtrack agent-sessions` CLI command
- Stop hook shell script (or Go binary)
- Hook installer update for Claude Code settings
- Dashboard "Agent Activity" component
- Dashboard respond UI (mobile-optimized)
- Long-poll endpoint implementation

## What We Don't Build

- WebSocket/SSE real-time updates (long-poll is simpler and sufficient)
- Multi-agent coordination (one session = one agent for now)
- Automated responses / AI-to-AI delegation
- Claude Code plugin/extension (we work entirely through the existing hooks API)
- Notification push to phone (user checks dashboard — push notifications are a future enhancement)

## Future Considerations

- **Push notifications** — mobile push when an agent pauses (requires notification service)
- **Canned responses** — quick-reply buttons for common instructions ("continue", "skip", "abort")
- **Session grouping** — group related pauses in a single conversation thread
- **Cost tracking** — show estimated token cost of idle polling per session
- **Auto-resume patterns** — "if no response in 30 min, try X" configurable fallback behaviors
