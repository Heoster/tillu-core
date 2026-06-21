import { config } from "../../config";
import {
  callOpenAICompatible,
  verifyProvider,
  type OpenAICompatibleConfig,
  type VerifyResult,
} from "./openai-compatible";
import type { ChatMessage } from "./cerebras";

const BASE_URL = "https://api.together.xyz/v1";

/**
 * Together AI free models (as of 2025):
 * - meta-llama/Llama-3.3-70B-Instruct-Turbo-Free
 * - meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo  (vision capable)
 * - deepseek-ai/DeepSeek-R1-Distill-Llama-70B-Free
 * - Qwen/Qwen2.5-72B-Instruct-Turbo-Free
 *
 * Uses OpenAI-compatible API format.
 */
export const TOGETHER_FREE_MODELS = [
  "meta-llama/Llama-3.3-70B-Instruct-Turbo-Free",
  "meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo",
  "deepseek-ai/DeepSeek-R1-Distill-Llama-70B-Free",
  "Qwen/Qwen2.5-72B-Instruct-Turbo-Free",
] as const;

export type TogetherModel = typeof TOGETHER_FREE_MODELS[number];

function getTogetherConfig(model?: string): OpenAICompatibleConfig {
  return {
    baseUrl: BASE_URL,
    apiKey: config.llm.togetherKey,
    model: model ?? config.llm.togetherModel,
    providerName: "Together AI",
    timeoutMs: 30000,
  };
}

export async function callTogether(
  messages: ChatMessage[],
  options?: {
    maxTokens?: number;
    temperature?: number;
    jsonMode?: boolean;
    model?: string;
  }
): Promise<string> {
  return callOpenAICompatible(
    getTogetherConfig(options?.model),
    messages,
    { ...options, maxTokens: options?.maxTokens ?? 1024, stream: false }
  );
}

/**
 * Verify Together AI key is working.
 */
export async function verifyTogether(): Promise<VerifyResult> {
  return verifyProvider(getTogetherConfig());
}
