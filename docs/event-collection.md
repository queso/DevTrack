# Event Collection: Identity Resolution & Redaction

This document describes how DevTrack collects, validates, and safely records events from git hooks and other sources.

## Project Identity Resolution Chain

When an event is sent to DevTrack, the client determines the project identity using this resolution chain:

1. **Explicit `--project-yaml` flag** (CLI only) - If provided, read project name/ID from the specified manifest file
2. **`devtrack.yaml` at repo root** - Auto-detect and read from `devtrack.yaml` in the current repository
3. **Git remote origin** - Extract repo URL from `.git/config` and match against known projects in the API
4. **Folder name** - Fall back to using the folder name as a project identifier

This design enables zero-setup bootstrapping: a repository doesn't need a manifest file to start sending events. On the first send, DevTrack auto-detects identity via git remote or folder name, then silently writes `devtrack.yaml` for future sends.

### Silent Bootstrap

When events are sent to a project without a `devtrack.yaml`, DevTrack automatically:

1. Resolves the project identity using steps 3-4 above
2. Writes `devtrack.yaml` with the detected configuration to the repo root
3. Creates a git commit with the new manifest

This bootstrap happens silently and never blocks the event send. To disable auto-bootstrap, set the `DEVTRACK_NO_BOOTSTRAP=1` environment variable before sending events.

**Important:** Bootstrap is write-once per session; subsequent sends in the same session reuse the bootstrapped config even if `devtrack.yaml` is deleted.

## Secret Redaction

Event payloads often contain sensitive data: API keys, tokens, credentials, and other secrets that should never be logged or stored. DevTrack applies client-side redaction before sending any event.

### Redaction Strategy

The redaction engine operates on two principles:

- **Value-only masking** - Sensitive values are replaced; keys are preserved for audit trails
- **Length preservation** - Redacted strings retain their length (with truncation markers) to maintain context

### Redacted Shapes

The redaction package closes over 8 distinct secret leak patterns:

1. **Environment variables** - `KEY=value` lines are scanned; suspicious keys trigger redaction
2. **Shell command arguments** - Command invocations with suspected secrets (e.g., `curl -H "Authorization: Bearer <token>"`)
3. **JSON credentials** - Objects with key names matching known patterns (`password`, `token`, `secret`, etc.)
4. **URL credentials** - Basic auth in URLs: `https://user:password@host`
5. **PEM key material** - Private key blocks (SSH, TLS)
6. **Git config secrets** - Credentials in `.git/config` or `.gitcredentials`
7. **API response bodies** - Tokens and keys in structured API responses
8. **Comments and logs** - Inline comments or debug output containing credentials

### Truncation Markers

Long redacted strings are capped at a maximum length with a truncation indicator (`…`) to save storage and bandwidth while preserving context. For example:

- Original: `export AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY`
- Redacted: `export AWS_SECRET_ACCESS_KEY=***…` (capped and marked)

### Deferred Enhancements

The following redaction improvements are tracked for future implementation:

- **Entropy-based detection** - Detect high-entropy strings that look like tokens (e.g., long base64)
- **Known prefixes** - Match AWS key patterns (`AKIA…`), Azure patterns, etc.
- **Space-separated commands** - Redact arguments in shell commands separated by spaces

## Integration Points

### Events API: Find-or-Create with Race Handling

The Events API (`POST /api/v1/events`) implements find-or-create semantics with race condition handling:

- Events are matched by project ID + event type + timestamp (with small tolerance)
- If two concurrent requests attempt to create the same event, the database unique constraint (`P2002`) catches the collision
- The race loser's connection attaches the event data to the winner's record
- This ensures exactly-once delivery semantics without distributed locking

### sendEvent Function

The `cli/cmd/event.go` file implements a single enforcement point for event sending:

1. **Identity resolution** - Determine project ID using the resolution chain
2. **Secret redaction** - Apply redaction to the event payload
3. **API POST** - Send the event to `/api/v1/events`

New event types are accepted by this function and automatically propagated to the API. The Go CLI is regenerated from the OpenAPI spec, so new types in the spec become new CLI flags automatically.

### Event Types

Supported event types (extensible via Prisma enum + migration):

- `commit` - Git commit (subject + hash + branch)
- `push` - Push to remote (branch + count)
- `pr_opened`, `pr_closed`, `pr_merged` - GitHub PR lifecycle
- `pr_reviewed` - Code review (status + reviewer)
- `pr_check_complete` - CI check suite finished
- `tool_use` - Claude Code tool usage (via PostToolUse hook)
- `checkout` - Branch checkout
- `merge` - Git merge operation
- `session_start`, `session_stop` - Claude Code session lifecycle

## Git Hooks

Git hooks installed via `devtrack hooks install` emit properly-typed events with real git data:

- Hook installer preserves existing custom hooks by managing marked blocks in-place
- `pre-commit` → `commit` event (subject + hash + branch name)
- `post-push` → `push` event (branch + pushed commit count)
- All hooks respect the identity resolution chain
- On upgrade, the installer updates managed blocks in existing hook files without erasing custom logic

## PostToolUse Hook

The Claude Code `PostToolUse` hook reads JSON event data from stdin and records `tool_use` events to the API. This captures Claude Code tool invocations (file reads, edits, shell commands) without creating phantom commits.

**Key difference from previous approach:** Earlier versions created synthetic git commits to record tool activity. The new `PostToolUse` hook eliminates phantom commits by recording tool use as events directly.
