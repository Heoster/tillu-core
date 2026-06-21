import { describe, it, expect } from "vitest";
import { WORKING_MODELS, getHealthStatus } from "./router";

// stripReasoningPreamble is not exported, so replicate the logic for testing.
function stripReasoningPreamble(text: string): string {
  const t = text.trim();

  // Pattern 1: "1. **Analyze the Request:**..." — numbered analysis preamble
  if (/^1\.\s+\*\*/.test(t)) {
    const responseMatch = t.match(/\*\*(?:Response|Final Response|Output|Answer)[:\s*]+\*\*\s*([\s\S]+?)(?:\n\n\d+\.|$)/i);
    if (responseMatch?.[1]?.trim()) return responseMatch[1].trim();

    const paragraphs = t.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
    const last = paragraphs[paragraphs.length - 1] ?? t;
    if (!/^\d+\.\s+\*\*/.test(last)) return last;
  }

  // Pattern 2: "We are initiating a conversation..." — proactive preamble
  if (/^We are (initiating|given|asked)/i.test(t)) {
    const lines = t.split("\n").map(l => l.trim()).filter(Boolean);
    const msgLine = lines.find(l =>
      !l.startsWith("We are") && !l.startsWith("The ") &&
      !l.startsWith("*") && l.length > 10
    );
    if (msgLine) return msgLine;
  }

  return text;
}

describe("brain/providers/router", () => {
  describe("WORKING_MODELS", () => {
    it("has groq models", () => {
      expect(WORKING_MODELS.groq.length).toBeGreaterThan(0);
    });

    it("has cerebras models", () => {
      expect(WORKING_MODELS.cerebras.length).toBeGreaterThan(0);
    });

    it("has openrouter models", () => {
      expect(WORKING_MODELS.openrouter.length).toBeGreaterThan(0);
    });
  });

  describe("getHealthStatus", () => {
    it("returns status for all three providers", () => {
      const status = getHealthStatus();
      expect(status).toHaveProperty("groq");
      expect(status).toHaveProperty("cerebras");
      expect(status).toHaveProperty("openrouter");
    });

    it("each provider has expected fields", () => {
      const status = getHealthStatus();
      for (const provider of ["groq", "cerebras", "openrouter"]) {
        const s = status[provider]!;
        expect(typeof s.ok).toBe("boolean");
        expect(typeof s.cooldown).toBe("boolean");
        expect(typeof s.calls).toBe("number");
        expect(typeof s.failures).toBe("number");
        expect(typeof s.failRate).toBe("string");
      }
    });

    it("initially all providers are ok and not on cooldown", () => {
      const status = getHealthStatus();
      for (const provider of ["groq", "cerebras", "openrouter"]) {
        expect(status[provider]!.ok).toBe(true);
        expect(status[provider]!.cooldown).toBe(false);
      }
    });
  });

  describe("stripReasoningPreamble", () => {
    it("passes through normal text unchanged", () => {
      const text = "Hello Heoster, the weather is nice today.";
      expect(stripReasoningPreamble(text)).toBe(text);
    });

    it("strips numbered analysis preamble and extracts response", () => {
      const text = `1. **Analyze the Request:** User wants weather
2. **Plan:** Get weather data

**Response:** It's sunny and warm today, 35 degrees in Muzaffarnagar.`;
      const result = stripReasoningPreamble(text);
      expect(result).toContain("sunny and warm");
      expect(result).not.toContain("Analyze the Request");
    });

    it("uses last paragraph when no Response section found", () => {
      const text = `1. **Step one:** something
2. **Step two:** something else

Final answer here.`;
      const result = stripReasoningPreamble(text);
      expect(result).toBe("Final answer here.");
    });

    it("strips 'We are initiating' preamble", () => {
      const text = `We are initiating a conversation with Heoster.
The trigger is a birthday.
Heoster, your friend Rahul's birthday is tomorrow!`;
      const result = stripReasoningPreamble(text);
      expect(result).toContain("birthday is tomorrow");
    });

    it("strips 'We are given' preamble", () => {
      const text = `We are given a request to check weather.
The city is Muzaffarnagar.
Heoster, it's quite warm today at 38 degrees!`;
      const result = stripReasoningPreamble(text);
      expect(result).toContain("warm today");
    });

    it("handles whitespace-padded text", () => {
      const text = "  \n  Hello Heoster  \n  ";
      const result = stripReasoningPreamble(text);
      expect(result).toBe(text);
    });

    it("handles Final Response label", () => {
      const text = `1. **Analyze:** something

**Final Response:** The exam is in 3 days.`;
      const result = stripReasoningPreamble(text);
      expect(result).toContain("exam is in 3 days");
    });
  });
});
