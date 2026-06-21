import { describe, it, expect, vi } from "vitest";

// parseClassifierOutput is not exported, so we test it indirectly via classify,
// but we need to mock the router. Alternatively, we extract and test the logic.
// Since it's a private function, we use a workaround:

// Re-implement the parse logic here for unit testing the parsing behavior.
// This mirrors the exact logic from classifier.ts.
function parseClassifierOutput(raw: string) {
  const jsonMatch = raw.match(/\{[^{}]*"intent"[^{}]*\}/s) ?? raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON found in classifier output");

  const cleaned = jsonMatch[0].trim();
  const parsed = JSON.parse(cleaned);
  return {
    intent: parsed.intent ?? "conversation",
    has_response: parsed.has_response ?? true,
    has_action: parsed.has_action ?? false,
    needs_confirmation: parsed.needs_confirmation ?? false,
    urgency: parsed.urgency ?? "low",
    short_circuit: parsed.short_circuit ?? false,
  };
}

describe("brain/classifier — parseClassifierOutput", () => {
  it("parses valid JSON object", () => {
    const raw = '{"intent":"search","has_response":true,"has_action":true,"needs_confirmation":false,"urgency":"low","short_circuit":false}';
    const result = parseClassifierOutput(raw);
    expect(result.intent).toBe("search");
    expect(result.has_response).toBe(true);
    expect(result.has_action).toBe(true);
    expect(result.short_circuit).toBe(false);
  });

  it("extracts JSON from reasoning preamble", () => {
    const raw = `Let me analyze this request...
The user wants to search for something.

{"intent":"search","has_response":true,"has_action":true,"needs_confirmation":false,"urgency":"medium","short_circuit":false}`;
    const result = parseClassifierOutput(raw);
    expect(result.intent).toBe("search");
    expect(result.urgency).toBe("medium");
  });

  it("defaults missing fields", () => {
    const raw = '{"intent":"question"}';
    const result = parseClassifierOutput(raw);
    expect(result.intent).toBe("question");
    expect(result.has_response).toBe(true);
    expect(result.has_action).toBe(false);
    expect(result.needs_confirmation).toBe(false);
    expect(result.urgency).toBe("low");
    expect(result.short_circuit).toBe(false);
  });

  it("defaults intent to conversation when missing", () => {
    const raw = '{"has_response":true}';
    const result = parseClassifierOutput(raw);
    expect(result.intent).toBe("conversation");
  });

  it("throws when no JSON found", () => {
    expect(() => parseClassifierOutput("just text, no json")).toThrow("No JSON found");
  });

  it("handles all intent types", () => {
    const intents = ["question", "search", "system_action", "vision", "code", "calendar", "memory", "conversation", "multi_step"];
    for (const intent of intents) {
      const raw = `{"intent":"${intent}"}`;
      expect(parseClassifierOutput(raw).intent).toBe(intent);
    }
  });

  it("handles all urgency levels", () => {
    for (const urgency of ["low", "medium", "high"]) {
      const raw = `{"intent":"conversation","urgency":"${urgency}"}`;
      expect(parseClassifierOutput(raw).urgency).toBe(urgency);
    }
  });

  it("handles JSON with extra whitespace", () => {
    const raw = `  {  "intent" : "code" , "has_action" : true  }  `;
    const result = parseClassifierOutput(raw);
    expect(result.intent).toBe("code");
    expect(result.has_action).toBe(true);
  });

  it("handles markdown-wrapped JSON", () => {
    const raw = "```json\n{\"intent\":\"memory\",\"has_response\":true}\n```";
    const result = parseClassifierOutput(raw);
    expect(result.intent).toBe("memory");
  });
});
