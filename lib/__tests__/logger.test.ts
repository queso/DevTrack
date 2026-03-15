import { Writable } from "node:stream"
import { describe, expect, it } from "vitest"
import { createLogger } from "@/lib/logger"

/**
 * Captures pino JSON output lines via a writable stream.
 * Each line pino writes is stored as a trimmed string in `lines`.
 */
function createLogCapture() {
  const lines: string[] = []
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(chunk.toString().trim())
      callback()
    },
  })
  return { lines, stream }
}

describe("createLogger", () => {
  it("should return a logger with info, debug, warn, and error methods", () => {
    const { stream } = createLogCapture()
    const logger = createLogger({ destination: stream })

    expect(typeof logger.info).toBe("function")
    expect(typeof logger.debug).toBe("function")
    expect(typeof logger.warn).toBe("function")
    expect(typeof logger.error).toBe("function")
  })

  it("should output JSON with a msg field when logging", () => {
    const { lines, stream } = createLogCapture()
    const logger = createLogger({ destination: stream })

    logger.info("hello world")

    expect(lines.length).toBeGreaterThanOrEqual(1)
    const entry = JSON.parse(lines[0])
    expect(entry.msg).toBe("hello world")
  })

  it("should suppress debug messages when log level is info", () => {
    const { lines, stream } = createLogCapture()
    const logger = createLogger({ level: "info", destination: stream })

    logger.debug("this should be suppressed")
    logger.info("this should appear")

    // Only the info message should be captured
    expect(lines).toHaveLength(1)
    const entry = JSON.parse(lines[0])
    expect(entry.msg).toBe("this should appear")
  })

  it("should log Error objects with error method", () => {
    const { lines, stream } = createLogCapture()
    const logger = createLogger({ destination: stream })

    const err = new Error("something broke")
    logger.error(err, "operation failed")

    expect(lines.length).toBeGreaterThanOrEqual(1)
    const entry = JSON.parse(lines[0])
    expect(entry.msg).toBe("operation failed")
    expect(entry.err).toBeDefined()
    expect(entry.err.message).toBe("something broke")
  })

  it("should add bindings from child logger to output", () => {
    const { lines, stream } = createLogCapture()
    const logger = createLogger({ destination: stream })
    const child = logger.child({ requestId: "abc-123" })

    child.info("child message")

    expect(lines.length).toBeGreaterThanOrEqual(1)
    const entry = JSON.parse(lines[0])
    expect(entry.msg).toBe("child message")
    expect(entry.requestId).toBe("abc-123")
  })

  it("should respect the configured log level", () => {
    const { lines, stream } = createLogCapture()
    const logger = createLogger({ level: "warn", destination: stream })

    logger.debug("no")
    logger.info("no")
    logger.warn("yes warn")
    logger.error("yes error")

    expect(lines).toHaveLength(2)
    const msgs = lines.map((l) => JSON.parse(l).msg)
    expect(msgs).toEqual(["yes warn", "yes error"])
  })
})
