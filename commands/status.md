# /devtrack:status

Display current project status from DevTrack.

## Usage

```
/devtrack:status
```

## Behavior

1. **Read project.yaml**
   Look for `project.yaml` in the current repo root.
   ```
   if project.yaml not found:
       error "No project.yaml found. Run /devtrack:setup first."
       exit
   ```

2. **Run status command**
   ```bash
   ${CLAUDE_PLUGIN_ROOT}/bin/devtrack status
   ```
   This reads `project.yaml` and `DEVTRACK_API_URL` / `DEVTRACK_API_KEY` from the environment.

3. **Display the output**
   The CLI returns structured project status. Display it to the user.

## Example Output

```
═══════════════════════════════════════════════════════════════
                       DEVTRACK STATUS
═══════════════════════════════════════════════════════════════

  Project:   my-project
  ID:        proj_abc123
  Remote:    https://github.com/org/my-project

  ┌─────────────────────────────┬────────────────────┐
  │ Metric                      │ Value              │
  ├─────────────────────────────┼────────────────────┤
  │ Open PRs                    │ 3                  │
  │ Merged today                │ 1                  │
  │ Active branches             │ 5                  │
  │ Last sync                   │ 2 minutes ago      │
  │ Pipeline stage              │ In Review          │
  └─────────────────────────────┴────────────────────┘

═══════════════════════════════════════════════════════════════
```

## CLI Command Used

| Command | Purpose |
|---------|---------|
| `devtrack status` | Fetch and display current project status |

## Errors

- **No project.yaml**: Run `/devtrack:setup` to register this repo
- **API unreachable**: Check `DEVTRACK_API_URL` in `.claude/settings.local.json`
- **Unauthorized**: Check `DEVTRACK_API_KEY` in `.claude/settings.local.json`
