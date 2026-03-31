# /devtrack:prs

Display the PR queue for the current project.

## Usage

```
/devtrack:prs
```

## Behavior

1. **Read project.yaml**
   Look for `project.yaml` in the current repo root.
   ```
   if project.yaml not found:
       error "No project.yaml found. Run /devtrack:setup first."
       exit
   ```

2. **Run prs command**
   ```bash
   ${CLAUDE_PLUGIN_ROOT}/bin/devtrack prs
   ```
   Reads `project.yaml` and credentials from environment variables.

3. **Display the PR queue**
   The CLI returns the current list of open pull requests with metadata.

## Example Output

```
═══════════════════════════════════════════════════════════════
                     PR QUEUE: my-project
═══════════════════════════════════════════════════════════════

  #142  feat: add user notifications
        Author: @alice  |  Opened: 2 days ago  |  CI: ✓ passing
        Reviewers: @bob (approved), @carol (pending)

  #139  fix: resolve race condition in sync worker
        Author: @dave  |  Opened: 3 days ago  |  CI: ✓ passing
        Reviewers: @alice (changes requested)

  #136  chore: upgrade dependencies
        Author: @eve   |  Opened: 5 days ago  |  CI: ✗ failing
        Reviewers: none assigned

═══════════════════════════════════════════════════════════════

  Open PRs:     3
  Ready to merge: 1 (#142)
  Needs attention: 1 (#139 — changes requested)
  Blocked:        1 (#136 — CI failing)

═══════════════════════════════════════════════════════════════
```

## CLI Command Used

| Command | Purpose |
|---------|---------|
| `devtrack prs` | Fetch and display the open PR queue for the current project |

## Errors

- **No project.yaml**: Run `/devtrack:setup` to register this repo
- **API unreachable**: Check `DEVTRACK_API_URL` in `.claude/settings.local.json`
- **No PRs found**: The project may not be synced — run `/devtrack:sync` first
