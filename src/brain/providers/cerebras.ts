import { config } from "../../config";
import {
  callOpenAICompatible,
  verifyProvider,
  type OpenAICompatibleConfig,
  type VerifyResult,
} from "./openai-compatible";

const BASE_URL = "https://api.cerebras.ai/v1";

/**
 * Cerebras free models (as of 2026):
 *   zai-glm-4.7  — free, fast inference (~200ms)
 *   gpt-oss-120b — free, larger model
 */
export const CEREBRAS_MODELS = [
  "zai-glm-4.7",
  "gpt-oss-120b",
] as const;

export const CEREBRAS_DEFAULT_MODEL = "gpt-oss-120b";

export type CerebrasModel = typeof CEREBRAS_MODELS[number];

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

function getModel(): string {
  const model = config.llm.cerebrasModel;
  if (!CEREBRAS_MODELS.includes(model as CerebrasModel)) {
    console.warn(
      `[Cerebras] Unknown model "${model}". Free model is: ${CEREBRAS_DEFAULT_MODEL}. Falling back.`
    );
    return CEREBRAS_DEFAULT_MODEL;
  }
  return model;
}

function getCerebrasConfig(): OpenAICompatibleConfig {
  return {
    baseUrl: BASE_URL,
    apiKey: config.llm.cerebrasKey,
    model: getModel(),
    providerName: "Cerebras",
    timeoutMs: 10000,
    supportsReasoning: true,
  };
}

/**
 * Call Cerebras GLM-4-9B — primary classifier.
 * Fastest free inference. Used for Stage 1 classification.
 */
export async function callCerebras(
  messages: ChatMessage[],
  options?: { maxTokens?: number; temperature?: number; jsonMode?: boolean }
): Promise<string> {
  return callOpenAICompatible(getCerebrasConfig(), messages, options);
}

/**
 * Verify Cerebras API key and model are working.
 */
export async function verifyCerebras(): Promise<VerifyResult> {
  return verifyProvider(getCerebrasConfig());
}
