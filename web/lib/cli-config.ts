import * as fs from "node:fs"
import * as yaml from "js-yaml"
import type { CliConfig, CliConfigFile } from "@/types/cli-config"

export function loadCliConfig(): CliConfig {
  const envUrl = process.env.DEVTRACK_API_URL
  const envKey = process.env.DEVTRACK_API_KEY

  let fileConfig: CliConfigFile = {}

  if (!envUrl || !envKey) {
    const homedir = process.env.HOME ?? process.env.USERPROFILE ?? "~"
    const configPath = `${homedir}/.devtrack/config.yaml`

    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, "utf-8")
      try {
        const parsed = yaml.load(raw)
        if (parsed && typeof parsed === "object") {
          fileConfig = parsed as CliConfigFile
        }
      } catch (err) {
        throw new Error(
          `Failed to parse config yaml at ${configPath}: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    }
  }

  const apiUrl = envUrl ?? fileConfig.api_url
  const apiKey = envKey ?? fileConfig.api_key

  if (!apiUrl) {
    throw new Error(
      "DEVTRACK_API_URL is required. Set it as an environment variable or as api_url in ~/.devtrack/config.yaml",
    )
  }

  if (!apiKey) {
    throw new Error(
      "DEVTRACK_API_KEY is required. Set it as an environment variable or as api_key in ~/.devtrack/config.yaml",
    )
  }

  return { apiUrl, apiKey }
}
