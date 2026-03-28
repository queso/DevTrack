# /devtrack:dashboard

Display cross-project overview from DevTrack.

## Usage

```
/devtrack:dashboard
```

## Behavior

1. **Run dashboard command**
   ```bash
   ${CLAUDE_PLUGIN_ROOT}/bin/devtrack dashboard
   ```
   Uses `DEVTRACK_API_URL` and `DEVTRACK_API_KEY` from the environment.
   Does **not** require a `project.yaml` — shows all tracked projects.

2. **Display the output**
   The CLI returns a summary across all registered projects.

## Example Output

```
═══════════════════════════════════════════════════════════════
                      DEVTRACK DASHBOARD
═══════════════════════════════════════════════════════════════

  ┌──────────────────┬───────────┬────────────┬──────────────┐
  │ Project          │ Open PRs  │ Stage      │ Last Sync    │
  ├──────────────────┼───────────┼────────────┼──────────────┤
  │ my-project       │ 3         │ In Review  │ 2m ago       │
  │ api-service      │ 1         │ Deployed   │ 5m ago       │
  │ design-system    │ 0         │ Idle       │ 1h ago       │
  │ data-pipeline    │ 5         │ In Dev     │ 12m ago      │
  └──────────────────┴───────────┴────────────┴──────────────┘

  Total open PRs:    9
  Projects tracked:  4

═══════════════════════════════════════════════════════════════
```

## CLI Command Used

| Command | Purpose |
|---------|---------|
| `devtrack dashboard` | Fetch and display status for all tracked projects |

## Errors

- **API unreachable**: Check `DEVTRACK_API_URL` in `.claude/settings.local.json`
- **No projects found**: Run `/devtrack:setup` in each repo you want to track
