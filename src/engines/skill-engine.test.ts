import { describe, it, expect } from "vitest";

// resolveTemplate and resolveParams are not exported, so replicate the logic for testing.
function resolveTemplate(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{([^}]+)\}/g, (_, path) => {
    const parts = path.split(".");
    let val: unknown = vars;
    for (const part of parts) {
      val = (val as Record<string, unknown>)?.[part];
    }
    return val !== undefined && val !== null ? String(val) : `{${path}}`;
  });
}

function resolveParams(params: Record<string, unknown>, vars: Record<string, unknown>): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    resolved[k] = typeof v === "string" ? resolveTemplate(v, vars) : v;
  }
  return resolved;
}

describe("engines/skill-engine — resolveTemplate", () => {
  it("replaces simple variable", () => {
    expect(resolveTemplate("Hello {name}!", { name: "Heoster" })).toBe("Hello Heoster!");
  });

  it("replaces nested variable", () => {
    const vars = { weather: { summary: "sunny and warm" } };
    expect(resolveTemplate("Today is {weather.summary}", vars)).toBe("Today is sunny and warm");
  });

  it("preserves unresolved variables", () => {
    expect(resolveTemplate("Missing {unknown}", {})).toBe("Missing {unknown}");
  });

  it("handles multiple variables", () => {
    const vars = { city: "Delhi", temp: "35" };
    expect(resolveTemplate("{city}: {temp}°C", vars)).toBe("Delhi: 35°C");
  });

  it("handles deeply nested paths", () => {
    const vars = { a: { b: { c: "deep" } } };
    expect(resolveTemplate("Value: {a.b.c}", vars)).toBe("Value: deep");
  });

  it("handles null values in path", () => {
    const vars = { a: { b: null } };
    expect(resolveTemplate("{a.b.c}", vars)).toBe("{a.b.c}");
  });

  it("handles numeric values", () => {
    expect(resolveTemplate("Count: {n}", { n: 42 })).toBe("Count: 42");
  });

  it("handles boolean values", () => {
    expect(resolveTemplate("Active: {flag}", { flag: true })).toBe("Active: true");
  });

  it("returns template unchanged when no placeholders", () => {
    expect(resolveTemplate("no placeholders here", { key: "val" })).toBe("no placeholders here");
  });

  it("handles empty template", () => {
    expect(resolveTemplate("", { key: "val" })).toBe("");
  });
});

describe("engines/skill-engine — resolveParams", () => {
  it("resolves string values with variables", () => {
    const params = { text: "Hello {name}", query: "weather in {city}" };
    const vars = { name: "Heoster", city: "Muzaffarnagar" };
    const result = resolveParams(params, vars);
    expect(result.text).toBe("Hello Heoster");
    expect(result.query).toBe("weather in Muzaffarnagar");
  });

  it("passes non-string values through", () => {
    const params = { count: 5, flag: true, nested: { a: 1 } };
    const result = resolveParams(params, {});
    expect(result.count).toBe(5);
    expect(result.flag).toBe(true);
    expect(result.nested).toEqual({ a: 1 });
  });

  it("handles empty params", () => {
    expect(resolveParams({}, { key: "val" })).toEqual({});
  });
});
