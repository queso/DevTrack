import type { Writable } from "node:stream"
import pino from "pino"
import { getEnv } from "@/lib/env"

const DEFAULT_LOG_LEVEL = "info"

interface LoggerOptions {
  level?: string
  destination?: Writable
}

function resolveLogLevel(): string {
  try {
    return getEnv().LOG_LEVEL
  } catch {
    return DEFAULT_LOG_LEVEL
  }
}

/**
 * Creates a structured JSON logger backed by pino.
 *
 * When a `destination` stream is provided the logger writes directly to it,
 * which keeps tests deterministic. Without a destination the logger writes to
 * stdout (with pino-pretty formatting in development).
 */
export function createLogger(options: LoggerOptions = {}): pino.Logger {
  const { level = resolveLogLevel(), destination } = options

  if (destination) {
    return pino({ level }, destination)
  }

  const isProduction = process.env.NODE_ENV === "production"

  if (!isProduction) {
    return pino({
      level,
      transport: { target: "pino-pretty" },
    })
  }

  return pino({ level })
}

let _logger: pino.Logger | undefined

/** Returns the application-wide logger singleton, created lazily. */
export function getLogger(): pino.Logger {
  if (!_logger) _logger = createLogger()
  return _logger
}

/** Application-wide logger instance. */
export const logger = getLogger()
