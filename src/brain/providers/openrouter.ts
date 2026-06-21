import { config } from "../../config";
import { callOpenAICompatible } from "./openai-compatible";
import type { ChatMessage } from "./cerebras";

/**
 * Call OpenRouter free tier — tertiary fallback for classifier + planner.
 * Uses OpenAI-compatible API format.
 */
export async function callOpenRouter(
  messages: ChatMessage[],
  options?: { maxTokens?: number; temperature?: number; jsonMode?: boolean }
): Promise<string> {
  return callOpenAICompatible(
    {
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: config.llm.openrouterKey,
      model: config.llm.openrouterModel,
      providerName: "OpenRouter",
      timeoutMs: 20000,
      extraHeaders: {
        "HTTP-Referer": "https://tillu-core.onrender.com",
        "X-Title": "Tillu-Core",
      },
    },
    messages,
    { ...options, maxTokens: options?.maxTokens ?? 1024 }
  );
}
