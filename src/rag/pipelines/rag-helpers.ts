/**
 * rag-helpers.ts — Shared utilities for RAG pipelines.
 *
 * Extracts two patterns duplicated across all 9+ RAG pipeline functions:
 *   1. withRagPipeline — wraps a retrieval function with timing, error handling,
 *      and an empty-result fallback (the try/catch/timing boilerplate).
 *   2. deduplicateChunks — deduplicates retrieved chunks by id or content prefix,
 *      then sorts by score and truncates.
 */

import type { RetrievedChunk } from "../retriever";
import type { RagResult } from "./memory-rag";

/**
 * Wraps a RAG retrieval function with consistent timing, error handling,
 * and empty-result fallback. Every RAG pipeline previously had this same
 * try/catch structure duplicated inline.
 *
 * Usage:
 *   return withRagPipeline("conversation-rag", async () => {
 *     // ... retrieval logic ...
 *     return { context, sources, chunks };
 *   });
 */
export async function withRagPipeline(
  pipelineName: string,
  fn: () => Promise<{ context: string; sources: string[]; chunks: RetrievedChunk[] }>
): Promise<RagResult> {
  const start = Date.now();
  try {
    const result = await fn();
    return {
      ...result,
      pipeline: pipelineName,
      latency_ms: Date.now() - start,
    };
  } catch (e) {
    console.error(`[RAG] ${pipelineName} failed:`, (e as Error).message);
    return {
      context: "",
      sources: [],
      pipeline: pipelineName,
      chunks: [],
      latency_ms: Date.now() - start,
    };
  }
}

/**
 * Deduplicates chunks by id (or first 40 chars of content as fallback key),
 * sorts by score descending, and truncates to `limit`.
 *
 * Previously duplicated verbatim in conversation-rag.ts, proactive-rag.ts,
 * and skill-rag.ts.
 */
export function deduplicateChunks(
  chunks: RetrievedChunk[],
  limit = 6
): RetrievedChunk[] {
  const seen = new Set<string>();
  const unique: RetrievedChunk[] = [];
  for (const c of chunks) {
    const key = c.id || c.content.slice(0, 40);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(c);
    }
  }
  return unique.sort((a, b) => b.score - a.score).slice(0, limit);
}
