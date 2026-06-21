import type { Request, Response } from "express";
import { getLatestBriefing } from "../tools/memory.tool";

/**
 * GET /briefing
 * Get the latest prepared morning briefing.
 */
export async function briefingHandler(_req: Request, res: Response): Promise<void> {
  try {
    const briefing = await getLatestBriefing();
    res.json({
      ready: !!briefing,
      briefing: briefing ?? null,
    });
  } catch (e) {
    console.error("[Route] /briefing failed:", (e as Error).message);
    res.status(500).json({ error: "Failed to fetch briefing" });
  }
}
