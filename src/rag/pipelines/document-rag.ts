// ─── Document RAG — document Q&A pipeline ────────────────────────────────────

import { retrieve, retrieveWithContext } from "../retriever";
import { callGroq } from "../../brain/providers/groq";
import type { RetrievedChunk } from "../retriever";
import type { RagResult } from "./memory-rag";
import { withRagPipeline } from "./rag-helpers";

function formatDocumentChunks(chunks: RetrievedChunk[]): { context: string; sources: string[] } {
  if (chunks.length === 0) return { context: "", sources: [] };

  const lines: string[] = [];
  const sources: string[] = [];

  for (const chunk of chunks) {
    // Try to parse structured chunk content
    let text = chunk.content;
    let title = "";
    let source = "";

    try {
      const parsed: unknown = JSON.parse(chunk.content);
      if (typeof parsed === "object" && parsed !== null) {
        const p = parsed as Record<string, unknown>;
        text = typeof p["text"] === "string" ? p["text"] : chunk.content;
        title = typeof p["title"] === "string" ? p["title"] : "";
        source = typeof p["source"] === "string" ? p["source"] : "";
      }
    } catch {
      // Not JSON — use raw content
    }

    const attribution = [title, source].filter(Boolean).join(" — ");
    lines.push(`${attribution ? `[${attribution}]\n` : ""}${text}`);
    if (attribution) sources.push(attribution);
    else if (chunk.source_session_id) sources.push(chunk.source_session_id);
  }

  return { context: lines.join("\n\n---\n\n"), sources: [...new Set(sources)] };
}

/** Retrieve document chunks, optionally filtered by documentId */
export async function documentRag(
  query: string,
  documentId?: string
): Promise<RagResult> {
  return withRagPipeline("document-rag", async () => {
    let chunks: RetrievedChunk[];

    if (documentId) {
      const raw = await retrieveWithContext(query, 1);
      chunks = raw.filter(c => c.source_session_id === documentId);

      if (chunks.length === 0) {
        chunks = await retrieve(query, { topK: 5, minScore: 0.2, rerank: true });
        chunks = chunks.filter(c => c.source_session_id === documentId);
      }
    } else {
      chunks = await retrieveWithContext(query, 1);
    }

    const top = chunks.slice(0, 5);
    const { context, sources } = formatDocumentChunks(top);
    return { context, sources, chunks: top };
  });
}

/** Run documentRag then answer the question using Groq */
export async function documentQA(
  question: string,
  documentId?: string
): Promise<string> {
  try {
    const ragResult = await documentRag(question, documentId);

    if (!ragResult.context) {
      return "I couldn't find relevant document content to answer that question.";
    }

    const prompt = [
      {
        role: "system" as const,
        content: `You are answering a question for Heoster based on retrieved document excerpts.
Answer concisely and accurately using only the provided context.
If the context doesn't contain enough information, say so clearly.
Keep the answer brief — it will be spoken aloud.`,
      },
      {
        role: "user" as const,
        content: `Context:\n${ragResult.context}\n\nQuestion: ${question}`,
      },
    ];

    const answer = await callGroq(prompt, { maxTokens: 300, temperature: 0.1 });
    return answer.trim();
  } catch (e) {
    console.error("[RAG] documentQA failed:", (e as Error).message);
    return "Sorry, I couldn't answer that question right now.";
  }
}
