import { routePlanner } from "./providers/router";
import { plannerPrompt } from "./prompts";
import { TOOL_SCHEMA, TOOL_SCHEMA_TEXT } from "./tools.schema";
import type { ToolCall, PlannerOutput } from "../types";

function parseToolCalls(raw: string): ToolCall[] {
  // Strip reasoning preamble — find the JSON array
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
  } catch (e) {
    console.warn("[Planner] Failed to parse tool calls from LLM output:", (e as Error).message);
    return [];
  }
}

/**
 * Stage 2: Plan tool calls for a given intent.
 * Uses the load-balanced router — equal load across Groq, Cerebras, OpenRouter.
 * Target latency: ~500ms
 */
export async function plan(
  intent: string,
  userInput: string,
  contextSummary: string
): Promise<PlannerOutput> {
  const messages = [
    {
      role: "system" as const,
      content: plannerPrompt(intent, userInput, contextSummary, TOOL_SCHEMA_TEXT),
    },
    { role: "user" as const, content: userInput },
  ];

  try {
    // Try with function calling tools first (Groq supports this natively)
    const raw = await routePlanner(messages, { tools: TOOL_SCHEMA });
    const toolCalls = parseToolCalls(raw);
    if (toolCalls.length > 0) return { tool_calls: toolCalls };
  } catch (e) {
    console.warn("[Planner] Router failed:", (e as Error).message.slice(0, 80));
  }

  return { tool_calls: [] };
}
