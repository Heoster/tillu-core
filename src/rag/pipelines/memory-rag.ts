// ─── Memory RAG — personal memory retrieval pipeline ─────────────────────────

import { retrieve } from "../retriever";
import { callGroq } from "../../brain/providers/groq";
import type { RetrievedChunk } from "../retriever";
import { withRagPipeline } from "./rag-helpers";

export interface RagResult {
  context: string;
  sources: string[];
  pipeline: string;
  chunks: RetrievedChunk[];
  latency_ms: number;
}

function formatMemoryChunks(chunks: RetrievedChunk[]): { context: string; sources: string[] } {
  if (chunks.length === 0) return { context: "", sources: [] };

  const lines: string[] = [];
  const sources: string[] = [];

  for (const chunk of chunks) {
    const score = (chunk.score * 100).toFixed(0);
    const date = chunk.created_at ? new Date(chunk.created_at).toLocaleDateString("en-IN") : "unknown date";
    const importance = chunk.importance ? ` [${chunk.importance}]` : "";
    lines.push(`• [${date}${importance}, relevance: ${score}%] ${chunk.content}`);
    if (chunk.source_session_id) sources.push(chunk.source_session_id);
  }

  return { context: lines.join("\n"), sources: [...new Set(sources)] };
}

/** Retrieve relevant memories and format as context */
export async function memoryRag(
  query: string,
  sessionId: string
): Promise<RagResult> {
  return withRagPipeline("memory-rag", async () => {
    const chunks = await retrieve(query, {
      topK: 8,
      minScore: 0.25,
      rerank: true,
    });

    const { context, sources } = formatMemoryChunks(chunks);
    return { context, sources, chunks };
  });
}

/** Rewrite query using Groq to expand it, then run memoryRag */
export async function memoryRagWithRewrite(
  query: string,
  sessionId: string
): Promise<RagResult & { originalQuery: string; rewrittenQuery: string }> {
  const start = Date.now();
  let rewrittenQuery = query;

  try {
    const rewritePrompt = [
      {
        role: "system" as const,
        content: `You are a query expansion assistant for Heoster's personal memory system.
Heoster is a Class 12 student at Maples Academy, Khatauli, Muzaffarnagar, India.
Expand the query to include likely related terms, full names, and context.
Return ONLY the expanded query string. No explanation.
Examples:
- "my exam" → "board exam Class 12 Maples Academy CBSE 2025 2026"
- "my friend" → "friend classmate school Maples Academy Khatauli"
- "yesterday" → "recent past conversation yesterday today"`,
      },
      { role: "user" as const, content: `Expand this query: "${query}"` },
    ];

    rewrittenQuery = await callGroq(rewritePrompt, { maxTokens: 100, temperature: 0.3 });
    rewrittenQuery = rewrittenQuery.trim().replace(/^["']|["']$/g, "");
  } catch (e) {
    console.warn("[RAG] Query rewrite failed, using original:", (e as Error).message);
  }

  const result = await memoryRag(rewrittenQuery, sessionId);

  return {
    ...result,
    pipeline: "memory-rag-rewrite",
    originalQuery: query,
    rewrittenQuery,
    latency_ms: Date.now() - start,
  };
}
