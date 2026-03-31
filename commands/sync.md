# /devtrack:sync

Trigger a full state sync for the current project.

## Usage

```
/devtrack:sync
```

## Behavior

1. **Read project.yaml**
   Look for `project.yaml` in the current repo root.
   ```
   if project.yaml not found:
       error "No project.yaml found. Run /devtrack:setup first."
       exit
   ```

2. **Run sync command**
   ```bash
   ${CLAUDE_PLUGIN_ROOT}/bin/devtrack sync
   ```
   Reads `project.yaml` and credentials from environment variables.

3. **Display sync progress and result**
   The CLI streams sync progress. Display it to the user.

## What Gets Synced

A full sync pulls the latest state from all connected sources:
- Git branch and commit state
- Open and recently merged pull requests
- CI/CD pipeline status
- Any configured content pipeline stages

## Example Output

```
Syncing my-project...

  Fetching branches...     ✓ 5 branches
  Fetching pull requests...✓ 3 open, 12 closed
  Fetching CI status...    ✓ 2 passing, 1 pending
  Updating SDLC state...   ✓ Stage: In Review

✓ Sync complete (1.2s)
  Last synced: just now
```

## CLI Command Used

| Command | Purpose |
|---------|---------|
| `devtrack sync` | Trigger a full state sync for the current project |

## Errors

- **No project.yaml**: Run `/devtrack:setup` to register this repo
- **API unreachable**: Check `DEVTRACK_API_URL` in `.claude/settings.local.json`
- **Sync failed**: Check the error output — often a missing GitHub token or webhook misconfiguration
