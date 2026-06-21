// ─── Retriever — vector retrieval from Tillu-memory ──────────────────────────

import axios from "axios";
import { config } from "../config";
import { embedText, cosineSimilarity } from "./embedder";

const USER_ID = config.heoster.userId;

export interface RetrieveOptions {
  topK?: number;
  minScore?: number;
  timeFilter?: string;
  type?: string;
  rerank?: boolean;
}

export interface RetrievedChunk {
  id: string;
  content: string;
  score: number;
  type?: string;
  importance?: string;
  topic_tags?: string[];
  source_session_id?: string;
  created_at?: string;
  chunk_index?: number;
}

function toRetrievedChunk(raw: unknown): RetrievedChunk {
  if (typeof raw !== "object" || raw === null) {
    return { id: "", content: String(raw), score: 0 };
  }
  const r = raw as Record<string, unknown>;
  return {
    id: typeof r["id"] === "string" ? r["id"] : "",
    content: typeof r["content"] === "string" ? r["content"] : "",
    score: typeof r["similarity_score"] === "number" ? r["similarity_score"]
         : typeof r["score"] === "number" ? r["score"] : 0,
    type: typeof r["type"] === "string" ? r["type"] : undefined,
    importance: typeof r["importance"] === "string" ? r["importance"] : undefined,
    topic_tags: Array.isArray(r["topic_tags"]) ? r["topic_tags"] as string[] : undefined,
    source_session_id: typeof r["source_session_id"] === "string" ? r["source_session_id"] : undefined,
    created_at: typeof r["created_at"] === "string" ? r["created_at"] : undefined,
    chunk_index: typeof r["chunk_index"] === "number" ? r["chunk_index"] : undefined,
  };
}

/** Retrieve relevant chunks from memory */
export async function retrieve(
  query: string,
  options?: RetrieveOptions
): Promise<RetrievedChunk[]> {
  const { topK = 5, minScore = 0.3, type, rerank = true } = options ?? {};

  try {
    const body: Record<string, unknown> = {
      user_id: USER_ID,
      query,
      top_k: topK,
    };
    if (type) body["type"] = type;

    const { data } = await axios.post(
      `${config.services.memoryUrl}/memory/search`,
      body,
      { timeout: 8000 }
    );

    const raw: unknown[] = Array.isArray(data.results) ? data.results : [];
    let chunks = raw.map(toRetrievedChunk).filter(c => c.score >= minScore);

    if (rerank && chunks.length > 1) {
      try {
        const queryVec = await embedText(query);
        const reranked = await Promise.all(
          chunks.map(async c => {
            try {
              const vec = await embedText(c.content);
              return { ...c, score: cosineSimilarity(queryVec, vec) };
            } catch (e) {
              console.warn("[RAG] Chunk re-embed failed, keeping original score:", (e as Error).message);
              return c;
            }
          })
        );
        chunks = reranked.sort((a, b) => b.score - a.score);
      } catch (e) {
        console.warn("[RAG] Rerank failed, using original order:", (e as Error).message);
      }
    }

    return chunks;
  } catch (e) {
    console.error("[RAG] retrieve failed:", (e as Error).message);
    return [];
  }
}

/** Run multiple queries in parallel, deduplicate, re-rank */
export async function retrieveMultiQuery(
  queries: string[],
  options?: RetrieveOptions
): Promise<RetrievedChunk[]> {
  if (queries.length === 0) return [];

  try {
    const results = await Promise.all(
      queries.map(q => retrieve(q, { ...options, rerank: false }))
    );

    // Deduplicate by id, keep highest score
    const seen = new Map<string, RetrievedChunk>();
    for (const batch of results) {
      for (const chunk of batch) {
        const key = chunk.id || chunk.content.slice(0, 50);
        const existing = seen.get(key);
        if (!existing || chunk.score > existing.score) {
          seen.set(key, chunk);
        }
      }
    }

    const merged = Array.from(seen.values());

    // Re-rank merged results using first query as anchor
    if (merged.length > 1 && queries[0]) {
      try {
        const queryVec = await embedText(queries[0]);
        const reranked = await Promise.all(
          merged.map(async c => {
            try {
              const vec = await embedText(c.content);
              return { ...c, score: cosineSimilarity(queryVec, vec) };
            } catch (e) {
              console.warn("[RAG] Chunk re-embed failed, keeping original score:", (e as Error).message);
              return c;
            }
          })
        );
        return reranked.sort((a, b) => b.score - a.score);
      } catch (e) {
        console.warn("[RAG] Multi-query rerank failed, using original scores:", (e as Error).message);
        return merged.sort((a, b) => b.score - a.score);
      }
    }

    return merged.sort((a, b) => b.score - a.score);
  } catch (e) {
    console.error("[RAG] retrieveMultiQuery failed:", (e as Error).message);
    return [];
  }
}

/** Retrieve top results then fetch neighboring chunks for context window */
export async function retrieveWithContext(
  query: string,
  windowSize = 1
): Promise<RetrievedChunk[]> {
  try {
    const top = await retrieve(query, { topK: 3, rerank: true });
    if (top.length === 0) return [];

    // For chunks that have chunk_index, fetch neighbors
    const expanded: RetrievedChunk[] = [...top];
    const seenIds = new Set(top.map(c => c.id));

    for (const chunk of top) {
      if (chunk.chunk_index === undefined || !chunk.source_session_id) continue;

      for (let offset = -windowSize; offset <= windowSize; offset++) {
        if (offset === 0) continue;
        const neighborIndex = chunk.chunk_index + offset;
        if (neighborIndex < 0) continue;

        try {
          const { data } = await axios.post(
            `${config.services.memoryUrl}/memory/search`,
            {
              user_id: USER_ID,
              query: `chunk_index:${neighborIndex} session:${chunk.source_session_id}`,
              top_k: 1,
            },
            { timeout: 5000 }
          );
          const neighbors: unknown[] = Array.isArray(data.results) ? data.results : [];
          for (const n of neighbors) {
            const nc = toRetrievedChunk(n);
            if (nc.id && !seenIds.has(nc.id)) {
              seenIds.add(nc.id);
              expanded.push({ ...nc, score: chunk.score * 0.8 });
            }
          }
        } catch (e) {
          console.warn("[RAG] Neighbor chunk fetch failed:", (e as Error).message);
        }
      }
    }

    return expanded.sort((a, b) => b.score - a.score);
  } catch (e) {
    console.error("[RAG] retrieveWithContext failed:", (e as Error).message);
    return [];
  }
}
