/**
 * openai-compatible.ts — Shared utilities for OpenAI-compatible LLM API calls.
 *
 * Most LLM providers (Cerebras, HuggingFace, OpenRouter, Together AI) expose
 * an OpenAI-compatible /v1/chat/completions endpoint. This module extracts
 * the common HTTP call pattern and provider verification logic that was
 * previously duplicated across each provider file.
 */

import type { ChatMessage } from "./cerebras";

export interface OpenAICompatibleOptions {
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
  stream?: boolean;
}

export interface OpenAICompatibleConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  providerName: string;
  timeoutMs?: number;
  extraHeaders?: Record<string, string>;
  /** If true, check message.reasoning / message.reasoning_content as fallback */
  supportsReasoning?: boolean;
}

interface ChatChoice {
  message?: {
    content?: string | null;
    reasoning?: string;
    reasoning_content?: string;
  };
}

/**
 * Shared OpenAI-compatible chat completions caller.
 * Handles: body construction, auth, jsonMode, timeout, error formatting,
 * and reasoning-model fallback (content -> reasoning -> reasoning_content).
 */
export async function callOpenAICompatible(
  cfg: OpenAICompatibleConfig,
  messages: ChatMessage[],
  options?: OpenAICompatibleOptions
): Promise<string> {
  if (!cfg.apiKey) throw new Error(`${cfg.providerName.toUpperCase()}_API_KEY not set`);

  const body: Record<string, unknown> = {
    model: cfg.model,
    messages,
    max_tokens: options?.maxTokens ?? 512,
    temperature: options?.temperature ?? 0.1,
    stream: options?.stream ?? false,
  };

  if (options?.jsonMode) {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
      ...(cfg.extraHeaders ?? {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(cfg.timeoutMs ?? 20000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`${cfg.providerName} error ${res.status}: ${err.slice(0, 120)}`);
  }

  const data = await res.json() as { choices: ChatChoice[] };
  const choice = data.choices?.[0]?.message;

  let text = choice?.content ?? "";
  if (!text && cfg.supportsReasoning) {
    text = choice?.reasoning_content || choice?.reasoning || "";
  }
  if (!text) throw new Error(`${cfg.providerName} returned empty response`);

  return text;
}

// ─── Provider Verification ────────────────────────────────────────────────────

export interface VerifyResult {
  ok: boolean;
  model: string;
  latency_ms: number;
  error?: string;
}

/**
 * Shared provider verification: sends "Reply with the single word: ok"
 * and returns latency + success status. Previously duplicated in
 * cerebras.ts and together.ts.
 */
export async function verifyProvider(cfg: OpenAICompatibleConfig): Promise<VerifyResult> {
  if (!cfg.apiKey) {
    return {
      ok: false,
      model: cfg.model,
      latency_ms: 0,
      error: `${cfg.providerName.toUpperCase()}_API_KEY not set`,
    };
  }

  const start = Date.now();
  try {
    const text = await callOpenAICompatible(cfg, [
      { role: "user", content: "Reply with the single word: ok" },
    ], { maxTokens: 5, temperature: 0 });

    return { ok: !!text, model: cfg.model, latency_ms: Date.now() - start };
  } catch (e) {
    return {
      ok: false,
      model: cfg.model,
      latency_ms: Date.now() - start,
      error: (e as Error).message.slice(0, 80),
    };
  }
}
