import { config } from "../../config";
import { callOpenAICompatible } from "./openai-compatible";
import type { ChatMessage } from "./cerebras";

/**
 * Call HuggingFace Inference API — last resort fallback.
 * Uses the OpenAI-compatible /v1/chat/completions endpoint.
 */
export async function callHuggingFace(
  messages: ChatMessage[],
  options?: { maxTokens?: number; temperature?: number }
): Promise<string> {
  return callOpenAICompatible(
    {
      baseUrl: "https://api-inference.huggingface.co/v1",
      apiKey: config.llm.hfKey,
      model: config.llm.hfModel,
      providerName: "HuggingFace",
      timeoutMs: 30000,
    },
    messages,
    { ...options, temperature: options?.temperature ?? 0.3, stream: false }
  );
}
