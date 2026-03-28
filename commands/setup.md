# /devtrack:setup

Configure DevTrack for the current repository.

## Usage

```
/devtrack:setup
```

## What This Command Does

1. **Auto-detects** git remote URL and existing `project.yaml`
2. **Registers** the project with the DevTrack API (find-or-create by name)
3. **Creates** `project.yaml` in the current repo root
4. **Writes** `DEVTRACK_API_URL` and `DEVTRACK_API_KEY` to `.claude/settings.local.json`
5. **Verifies** API connectivity
6. **Optionally injects** DevTrack instructions into `CLAUDE.md`

## Behavior

### Step 1: Check for Existing Configuration

Before asking questions, inspect the project for existing setup:

1. **Check for `project.yaml`** in the current repo root
   - If found, read and display its contents
   - Ask if the user wants to re-run setup or just update credentials

2. **Check `.claude/settings.local.json`** for existing env vars:
   ```
   DEVTRACK_API_URL
   DEVTRACK_API_KEY
   ```

3. **Auto-detect git remote URL:**
   ```bash
   git remote get-url origin
   ```

### Step 2: Collect Project Information

**Ask for the DevTrack API URL if not configured:**
```
AskUserQuestion({
  questions: [{
    question: "Where is the DevTrack API running?",
    header: "DevTrack API URL",
    options: [
      { label: "http://localhost:3000 (local dev)", description: "Default local development server" },
      { label: "Custom URL", description: "Enter your DevTrack instance URL" }
    ],
    multiSelect: false
  }]
})
```

**Ask for the API key:**
```
AskUserQuestion({
  questions: [{
    question: "Enter your DevTrack API key (leave blank if not required):",
    header: "DevTrack API Key"
  }]
})
```

**Ask for the project name:**

Auto-suggest from the git remote URL or current directory name:
- Extract from remote: `github.com/org/my-project` → `my-project`
- Fallback: current directory name

```
AskUserQuestion({
  questions: [{
    question: "What is this project's name in DevTrack?",
    header: "Project Name",
    options: [
      { label: "<auto-detected name> (Recommended)", description: "Detected from git remote or folder name" },
      { label: "Custom name", description: "Enter a custom project name" }
    ],
    multiSelect: false
  }]
})
```

### Step 3: Register Project with DevTrack API

Run the DevTrack CLI to register (find-or-create) the project:

```bash
${CLAUDE_PLUGIN_ROOT}/bin/devtrack register --name "<project-name>" --remote "<git-remote-url>"
```

This command:
- Finds an existing project by name, or creates a new one
- Returns the project ID and slug

**On success:**
```
✓ Project registered: my-project (id: proj_abc123)
```

**On failure:**
```
⚠ Could not register project. Check your API URL and key, then try again.
  Error: <error message>
```

### Step 4: Create project.yaml

Write `project.yaml` to the current repo root:

```yaml
# DevTrack project configuration
# See: https://devtrack.example.com/docs/project-config

name: my-project
id: proj_abc123
remote: https://github.com/org/my-project
```

If a `project.yaml` already exists, confirm before overwriting:
```
project.yaml already exists with name: old-project
Overwrite with updated configuration? (y/N)
```

### Step 5: Write Credentials to .claude/settings.local.json

Merge the DevTrack env vars into `.claude/settings.local.json`:

```json
{
  "env": {
    "DEVTRACK_API_URL": "http://localhost:3000",
    "DEVTRACK_API_KEY": "your-api-key-here"
  }
}
```

**IMPORTANT:** This file is gitignored. Credentials stay local.

If the file doesn't exist, create it. If it exists, merge without overwriting unrelated keys.

### Step 6: Verify API Connectivity

Test connection using the CLI:

```bash
${CLAUDE_PLUGIN_ROOT}/bin/devtrack status
```

**On success:**
```
✓ Connected to DevTrack API at http://localhost:3000
✓ Project: my-project (active)
```

**On failure:**
```
⚠ Could not connect to DevTrack API at http://localhost:3000
  Make sure the DevTrack server is running and your API key is correct.
  You can update credentials by re-running /devtrack:setup.
```

### Step 7: Inject DevTrack Instructions into CLAUDE.md (Optional)

Ask the user if they want DevTrack context injected:

```
AskUserQuestion({
  questions: [{
    question: "Add DevTrack usage instructions to CLAUDE.md?",
    header: "Update CLAUDE.md",
    options: [
      { label: "Yes (Recommended)", description: "Adds /devtrack:status and sync reminders to your project instructions" },
      { label: "No", description: "Skip — you can add manually later" }
    ],
    multiSelect: false
  }]
})
```

**If yes**, check for existing `## DevTrack` section in CLAUDE.md and append if absent:

```markdown

## DevTrack Integration

This project is tracked by DevTrack for SDLC state and PR queue monitoring.

### Commands

- `/devtrack:status` - Show current project status
- `/devtrack:sync` - Trigger a full state sync
- `/devtrack:prs` - View PR queue
- `/devtrack:dashboard` - Cross-project overview
```

## CLI Command Used

| Command | Purpose |
|---------|---------|
| `devtrack register` | Register or find project in DevTrack API |
| `devtrack status` | Verify connectivity and project state |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DEVTRACK_API_URL` | Yes | Base URL for the DevTrack API |
| `DEVTRACK_API_KEY` | No | API key for authenticated access |

## Example Output

```
DevTrack Setup

Detecting project...
  Remote:  https://github.com/org/my-project
  Name:    my-project (from git remote)

Registering with DevTrack API...
  ✓ Project registered: my-project (id: proj_abc123)

Creating project.yaml...
  ✓ Written to project.yaml

Updating .claude/settings.local.json...
  ✓ DEVTRACK_API_URL = "http://localhost:3000"
  ✓ DEVTRACK_API_KEY = "***" (set)

Verifying connectivity...
  ✓ Connected to DevTrack at http://localhost:3000

Updating CLAUDE.md...
  ✓ Added DevTrack integration instructions

⚠️  RESTART REQUIRED
Environment variables are loaded when Claude Code starts.
To pick up the new settings:
  1. Exit this session (/exit or Ctrl+C)
  2. Restart Claude Code in this directory
```

## Notes

- Safe to run multiple times — won't create duplicate CLAUDE.md sections
- `project.yaml` is committed to the repo; credentials in `.claude/settings.local.json` are not
- After changing API URL or key, restart Claude Code for the new values to take effect
