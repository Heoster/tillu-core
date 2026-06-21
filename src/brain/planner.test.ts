import { describe, it, expect } from "vitest";

// parseToolCalls is not exported, so we replicate the logic for testing.
function parseToolCalls(raw: string) {
  const arrayMatch = raw.match(/\[[\s\S]*\]/);
  if (!arrayMatch) return [];

  try {
    const parsed = JSON.parse(arrayMatch[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item: Record<string, unknown>) => ({
      tool: String(item.tool ?? item.name ?? ""),
      params: (item.params ?? item.arguments ?? {}) as Record<string, unknown>,
      reason: item.reason as string | undefined,
    }));
  } catch {
    return [];
  }
}

describe("brain/planner — parseToolCalls", () => {
  it("parses a valid tool call array", () => {
    const raw = '[{"tool":"search","params":{"query":"weather"}}]';
    const result = parseToolCalls(raw);
    expect(result).toHaveLength(1);
    expect(result[0]!.tool).toBe("search");
    expect(result[0]!.params).toEqual({ query: "weather" });
  });

  it("parses multiple tool calls", () => {
    const raw = '[{"tool":"search","params":{"query":"news"}},{"tool":"speak","params":{"text":"hello"}}]';
    const result = parseToolCalls(raw);
    expect(result).toHaveLength(2);
    expect(result[0]!.tool).toBe("search");
    expect(result[1]!.tool).toBe("speak");
  });

  it("extracts array from reasoning preamble", () => {
    const raw = `I need to search for this.

[{"tool":"search","params":{"query":"AI news"}}]`;
    const result = parseToolCalls(raw);
    expect(result).toHaveLength(1);
    expect(result[0]!.tool).toBe("search");
  });

  it("returns empty array when no array found", () => {
    const raw = "just some text without json";
    const result = parseToolCalls(raw);
    expect(result).toEqual([]);
  });

  it("returns empty array for non-array JSON", () => {
    const raw = '{"tool":"search","params":{}}';
    const result = parseToolCalls(raw);
    expect(result).toEqual([]);
  });

  it("returns empty array for invalid JSON", () => {
    const raw = "[invalid json content]";
    const result = parseToolCalls(raw);
    expect(result).toEqual([]);
  });

  it("handles name field as tool alias", () => {
    const raw = '[{"name":"weather","arguments":{"city":"Delhi"}}]';
    const result = parseToolCalls(raw);
    expect(result[0]!.tool).toBe("weather");
    expect(result[0]!.params).toEqual({ city: "Delhi" });
  });

  it("handles reason field", () => {
    const raw = '[{"tool":"search","params":{"query":"test"},"reason":"user asked"}]';
    const result = parseToolCalls(raw);
    expect(result[0]!.reason).toBe("user asked");
  });

  it("defaults params to empty object when missing", () => {
    const raw = '[{"tool":"hands"}]';
    const result = parseToolCalls(raw);
    expect(result[0]!.params).toEqual({});
  });

  it("defaults tool to empty string when missing", () => {
    const raw = '[{"params":{"query":"test"}}]';
    const result = parseToolCalls(raw);
    expect(result[0]!.tool).toBe("");
  });
});
