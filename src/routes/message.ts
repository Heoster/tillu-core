import type { Request, Response } from "express";
import { runAgenticLoop } from "../engines/agentic-loop";
import { loadContext } from "../tools/memory.tool";
import { getContextSummary, getLatestContext } from "../ws/sense-handler";

/**
 * POST /message
 * HTTP fallback when WebSocket is unavailable.
 * Body: { text: string, image?: string }
 */
export async function messageHandler(req: Request, res: Response): Promise<void> {
  const { text, image } = req.body as { text?: string; image?: string };

  if (!text?.trim()) {
    res.status(400).json({ error: "text is required" });
    return;
  }

  const sessionId = `sess_http_${Date.now()}`;
  const ctx = await loadContext(sessionId, text);
  const senseCtx = getLatestContext();

  // Run loop but don't wait for full completion — return immediately
  runAgenticLoop({
    userInput: text,
    contextSummary: ctx.summary || getContextSummary(),
    userState: senseCtx?.user_state,
    sessionId,
    image,
  }).catch(e => {
    console.error("[Route] /message agentic loop failed:", (e as Error).message);
  });

  res.json({
    ok: true,
    message: "Processing your request. Connect via WebSocket for real-time updates.",
    session_id: sessionId,
  });
}
