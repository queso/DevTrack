import * as fs from "node:fs"
import type { HookErrorEntry } from "@/types/hook-logger"

const homedir = process.env.HOME ?? process.env.USERPROFILE ?? "~"
const DEVTRACK_DIR = `${homedir}/.devtrack`
const LOG_FILE = `${DEVTRACK_DIR}/hook-errors.log`

export function logHookError(hookName: string, error: unknown): void {
  try {
    if (!fs.existsSync(DEVTRACK_DIR)) {
      fs.mkdirSync(DEVTRACK_DIR, { recursive: true })
    }

    const errorMessage = error instanceof Error ? error.message : String(error ?? "unknown error")

    const entry: HookErrorEntry = {
      hookName,
      errorMessage,
      timestamp: new Date().toISOString(),
    }

    const line = `[${entry.timestamp}] [${entry.hookName}] ${entry.errorMessage}\n`
    fs.appendFileSync(LOG_FILE, line)
  } catch {
    // Never throw — hooks must not block git operations
  }
}

export async function wrapHookCall(hookName: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
  } catch (error) {
    logHookError(hookName, error)
  }
}
