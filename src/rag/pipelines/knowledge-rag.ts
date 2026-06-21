// ─── Knowledge RAG — factual/knowledge query pipeline ────────────────────────

import { retrieveMultiQuery } from "../retriever";
import { cosineSimilarity, embedText } from "../embedder";
import { callGroq } from "../../brain/providers/groq";
import type { RetrievedChunk } from "../retriever";
import type { RagResult } from "./memory-rag";
import { withRagPipeline } from "./rag-helpers";

/** Generate 3 query variants using Groq */
async function generateQueryVariants(query: string): Promise<string[]> {
  try {
    const prompt = [
      {
        role: "system" as const,
        content: `Generate 3 different search query variants for the given question.
Return a JSON array of 3 strings only. No explanation.
Make each variant approach the topic differently (synonyms, related terms, broader/narrower scope).`,
      },
      { role: "user" as const, content: `Query: "${query}"` },
    ];

    const raw = await callGroq(prompt, { maxTokens: 200, temperature: 0.5, jsonMode: true });
    const parsed: unknown = JSON.parse(raw);

    if (Array.isArray(parsed)) {
      return [query, ...parsed.slice(0, 2).map(v => String(v))];
    }
    return [query];
  } catch (e) {
    console.warn("[RAG] Query variant generation failed:", (e as Error).message);
    return [query];
  }
}

function formatKnowledgeChunks(chunks: RetrievedChunk[]): { context: string; sources: string[] } {
  if (chunks.length === 0) return { context: "", sources: [] };

  const lines = chunks.map((c, i) =>
    `[${i + 1}] ${c.content}${c.type ? ` (type: ${c.type})` : ""}`
  );
  const sources = chunks
    .map(c => c.source_session_id ?? c.type ?? "memory")
    .filter(Boolean);

  return { context: lines.join("\n\n"), sources: [...new Set(sources)] };
}

/** Multi-query retrieval with re-ranking */
export async function knowledgeRag(
  query: string,
  _context: string
): Promise<RagResult> {
  return withRagPipeline("knowledge-rag", async () => {
    const variants = await generateQueryVariants(query);
    const chunks = await retrieveMultiQuery(variants, { topK: 5, minScore: 0.25, rerank: true });
    const top5 = chunks.slice(0, 5);
    const { context, sources } = formatKnowledgeChunks(top5);
    return { context, sources, chunks: top5 };
  });
}

/** Combine web search results with vector memory, weighted merge */
export async function hybridKnowledgeRag(
  query: string,
  searchResults: string,
  _context: string
): Promise<RagResult> {
  const start = Date.now();

  try {
    const [memoryChunks, queryVec] = await Promise.all([
      retrieveMultiQuery([query], { topK: 5, minScore: 0.2, rerank: false }),
      embedText(query).catch(() => [] as number[]),
    ]);

    const now = Date.now();
    const scoredMemory: RetrievedChunk[] = memoryChunks.map(c => {
      let score = c.score * 0.4;
      if (c.created_at) {
        const age = now - new Date(c.created_at).getTime();
        const dayMs = 86400000;
        if (age < 7 * dayMs) score += 0.1 * (1 - age / (7 * dayMs));
      }
      return { ...c, score };
    });

    const searchLines = searchResults.split("\n").filter(l => l.trim().length > 30);
    const searchChunks: RetrievedChunk[] = searchLines.slice(0, 5).map((line, i) => {
      let score = 0.6;
      if (queryVec.length > 0) {
        score = 0.6 * (1 - i * 0.05);
      }
      return {
        id: `search_${i}`,
        content: line,
        score,
        type: "search_result",
      };
    });

    const merged = [...searchChunks, ...scoredMemory]
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    const contextParts: string[] = [];
    const sources: string[] = [];

    if (searchChunks.length > 0) {
      contextParts.push(`[Web Search Results]\n${searchLines.slice(0, 5).join("\n")}`);
      sources.push("web_search");
    }

    const memTop = scoredMemory.slice(0, 3);
    if (memTop.length > 0) {
      contextParts.push(`[Memory Context]\n${memTop.map(c => c.content).join("\n")}`);
      sources.push(...memTop.map(c => c.source_session_id ?? "memory").filter(Boolean));
    }

    return {
      context: contextParts.join("\n\n"),
      sources: [...new Set(sources)],
      pipeline: "hybrid-knowledge-rag",
      chunks: merged,
      latency_ms: Date.now() - start,
    };
  } catch (e) {
    console.error("[RAG] hybridKnowledgeRag failed:", (e as Error).message);
    return { context: searchResults, sources: ["web_search"], pipeline: "hybrid-knowledge-rag", chunks: [], latency_ms: Date.now() - start };
  }
}
