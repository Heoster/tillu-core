import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createLogger } from "./logger";

describe("utils/logger", () => {
  let consoleSpy: {
    debug: ReturnType<typeof vi.spyOn>;
    log: ReturnType<typeof vi.spyOn>;
    warn: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
  };

  beforeEach(() => {
    consoleSpy = {
      debug: vi.spyOn(console, "debug").mockImplementation(() => {}),
      log: vi.spyOn(console, "log").mockImplementation(() => {}),
      warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
      error: vi.spyOn(console, "error").mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a logger with all four methods", () => {
    const log = createLogger("TestService");
    expect(typeof log.debug).toBe("function");
    expect(typeof log.info).toBe("function");
    expect(typeof log.warn).toBe("function");
    expect(typeof log.error).toBe("function");
  });

  it("info logs with [INFO] and service name", () => {
    const log = createLogger("MyService");
    log.info("hello world");
    expect(consoleSpy.log).toHaveBeenCalledTimes(1);
    const msg = consoleSpy.log.mock.calls[0]![0] as string;
    expect(msg).toContain("[INFO]");
    expect(msg).toContain("[MyService]");
    expect(msg).toContain("hello world");
  });

  it("warn logs with [WARN] and service name", () => {
    const log = createLogger("WarnService");
    log.warn("something wrong");
    expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
    const msg = consoleSpy.warn.mock.calls[0]![0] as string;
    expect(msg).toContain("[WARN]");
    expect(msg).toContain("[WarnService]");
    expect(msg).toContain("something wrong");
  });

  it("error logs with [ERROR] and service name", () => {
    const log = createLogger("ErrService");
    log.error("critical failure");
    expect(consoleSpy.error).toHaveBeenCalledTimes(1);
    const msg = consoleSpy.error.mock.calls[0]![0] as string;
    expect(msg).toContain("[ERROR]");
    expect(msg).toContain("[ErrService]");
    expect(msg).toContain("critical failure");
  });

  it("includes ISO timestamp in log output", () => {
    const log = createLogger("TSService");
    log.info("ts test");
    const msg = consoleSpy.log.mock.calls[0]![0] as string;
    expect(msg).toMatch(/\[\d{4}-\d{2}-\d{2}T/);
  });

  it("includes data as JSON when object is passed", () => {
    const log = createLogger("DataService");
    log.info("with data", { key: "value" });
    const msg = consoleSpy.log.mock.calls[0]![0] as string;
    expect(msg).toContain('{"key":"value"}');
  });

  it("includes data as string when string is passed", () => {
    const log = createLogger("DataService");
    log.info("with str data", "extra info");
    const msg = consoleSpy.log.mock.calls[0]![0] as string;
    expect(msg).toContain("extra info");
  });

  it("does not include data section when data is undefined", () => {
    const log = createLogger("NoData");
    log.info("no data");
    const msg = consoleSpy.log.mock.calls[0]![0] as string;
    // should end with the message, no trailing json
    expect(msg).toMatch(/no data$/);
  });
});
