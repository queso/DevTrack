export type HookScriptName = "post-commit" | "post-push" | "pre-session" | "post-session"

export interface HookScript {
  name: HookScriptName
  filename: string
  content: string
}

export interface ClaudeSettingsHook {
  matcher: string
  hooks: Array<{ type: "command"; command: string }>
}

export interface ClaudeSettings {
  hooks?: Record<string, ClaudeSettingsHook[]>
}

export interface HookInstallOptions {
  projectDir: string
  force?: boolean
}

export interface HookInstallResult {
  hooksDir: string
  scriptsCreated: HookScriptName[]
  settingsUpdated: boolean
}
