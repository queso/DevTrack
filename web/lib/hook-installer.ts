import * as fs from "node:fs"
import * as path from "node:path"
import type {
  ClaudeSettings,
  HookInstallOptions,
  HookInstallResult,
  HookScriptName,
} from "@/types/hooks"

const HOOK_SCRIPTS: Record<HookScriptName, string> = {
  "post-commit": `#!/bin/bash
# DevTrack post-commit hook
# Reads project name from project.yaml and records a commit event

PROJECT_YAML="$(git rev-parse --show-toplevel)/project.yaml"
BRANCH=$(git rev-parse --abbrev-ref HEAD)
HASH=$(git rev-parse HEAD)
MESSAGE=$(git log -1 --pretty=%s)
printf -v SAFE_MESSAGE '%q' "$MESSAGE"

devtrack event commit --branch "$BRANCH" --hash "$HASH" --message $SAFE_MESSAGE --project-yaml "$PROJECT_YAML" || true
`,

  "post-push": `#!/bin/bash
# DevTrack post-push hook
# Reads project name from project.yaml and records a push event

PROJECT_YAML="$(git rev-parse --show-toplevel)/project.yaml"
BRANCH=$(git rev-parse --abbrev-ref HEAD)
COUNT=$(git rev-list --count @{u}..HEAD 2>/dev/null || echo "0")

devtrack event push --branch "$BRANCH" --count "$COUNT" --project-yaml "$PROJECT_YAML" || true
`,

  "pre-session": `#!/bin/bash
# DevTrack pre-session hook
# Reads project name from project.yaml and records a session-start event

PROJECT_YAML="$(git rev-parse --show-toplevel)/project.yaml"

devtrack event session-start --project-yaml "$PROJECT_YAML" || true
`,

  "post-session":
    "#!/bin/bash\n" +
    "# DevTrack post-session hook\n" +
    "# Reads project name from project.yaml and records a session-end event with duration\n\n" +
    'PROJECT_YAML="$(git rev-parse --show-toplevel)/project.yaml"\n' +
    "DURATION=$" +
    "{DEVTRACK_SESSION_DURATION:-0}\n\n" +
    'devtrack event session-end --duration "$DURATION" --project-yaml "$PROJECT_YAML" || true\n',
}

const HOOK_EVENT_TYPES: Record<HookScriptName, string> = {
  "post-commit": "PostToolUse",
  "post-push": "PostToolUse",
  "pre-session": "PreToolUse",
  "post-session": "PostToolUse",
}

const HOOK_MATCHERS: Record<HookScriptName, string> = {
  "post-commit": "Bash",
  "post-push": "Bash",
  "pre-session": "Bash",
  "post-session": "Bash",
}

export async function installHooks(options: HookInstallOptions): Promise<HookInstallResult> {
  const { projectDir, force = false } = options
  const hooksDir = path.join(projectDir, ".claude", "hooks")
  const settingsPath = path.join(projectDir, ".claude", "settings.json")

  // Create hooks directory if needed
  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true })
  }

  const scriptsCreated: HookScriptName[] = []
  const hookNames: HookScriptName[] = ["post-commit", "post-push", "pre-session", "post-session"]

  for (const name of hookNames) {
    const scriptPath = path.join(hooksDir, `${name}.sh`)
    if (force || !fs.existsSync(scriptPath)) {
      fs.writeFileSync(scriptPath, HOOK_SCRIPTS[name])
      fs.chmodSync(scriptPath, 0o755)
      scriptsCreated.push(name)
    }
  }

  // Read existing settings
  let settings: ClaudeSettings = {}
  if (fs.existsSync(settingsPath)) {
    try {
      const raw = fs.readFileSync(settingsPath, "utf-8") as string
      settings = JSON.parse(raw) as ClaudeSettings
    } catch {
      settings = {}
    }
  }

  if (!settings.hooks) {
    settings.hooks = {}
  }

  // Register hooks, deduplicating by command path
  for (const name of hookNames) {
    const scriptPath = path.join(hooksDir, `${name}.sh`)
    const eventType = HOOK_EVENT_TYPES[name]
    const matcher = HOOK_MATCHERS[name]

    if (!settings.hooks[eventType]) {
      settings.hooks[eventType] = []
    }

    const alreadyRegistered = settings.hooks[eventType].some((entry) =>
      entry.hooks?.some((h) => h.command === scriptPath),
    )

    if (!alreadyRegistered) {
      settings.hooks[eventType].push({
        matcher,
        hooks: [{ type: "command", command: scriptPath }],
      })
    }
  }

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2))

  return {
    hooksDir,
    scriptsCreated,
    settingsUpdated: true,
  }
}
