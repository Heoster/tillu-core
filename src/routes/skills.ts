import type { Request, Response } from "express";
import { getSkills, getSkill, runSkill, createSkillFromVoice } from "../engines/skill-engine";
import type { SkillStep } from "../types";

/**
 * GET /skills
 * List all loaded skills with metadata.
 */
export async function skillsListHandler(_req: Request, res: Response): Promise<void> {
  const skills = getSkills().map(s => ({
    name: s.skill,
    description: s.description,
    version: s.version,
    created_by: s.created_by,
    triggers: s.trigger?.voice_commands ?? [],
    steps: s.steps.length,
    policy: s.policy,
  }));

  res.json({ ok: true, count: skills.length, skills });
}

/**
 * POST /skills/run
 * Manually trigger a skill by name.
 * Body: { name: string }
 */
export async function skillsRunHandler(req: Request, res: Response): Promise<void> {
  const { name } = req.body as { name?: string };
  if (!name) { res.status(400).json({ error: "name is required" }); return; }

  const skill = getSkill(name);
  if (!skill) { res.status(404).json({ error: `Skill not found: ${name}` }); return; }

  try {
    const result = await runSkill(name);
    res.json({ ok: result.success, ...result });
  } catch (e) {
    console.error(`[Route] /skills/run failed for "${name}":`, (e as Error).message);
    res.status(500).json({ error: `Skill execution failed: ${(e as Error).message}` });
  }
}

/**
 * POST /skills/create
 * Create a new skill from a voice instruction.
 * Body: { name, trigger, steps, description? }
 */
export async function skillsCreateHandler(req: Request, res: Response): Promise<void> {
  const { name, trigger, steps, description } = req.body as {
    name?: string;
    trigger?: string;
    steps?: SkillStep[];
    description?: string;
  };

  if (!name || !trigger || !steps?.length) {
    res.status(400).json({ error: "name, trigger, and steps are required" });
    return;
  }

  try {
    const ok = await createSkillFromVoice(name, trigger, steps, description);
    if (ok) {
      res.json({ ok: true, message: `Skill "${name}" created. Say "${trigger}" to use it.` });
    } else {
      res.status(500).json({ error: "Failed to create skill — skills directory not configured" });
    }
  } catch (e) {
    console.error(`[Route] /skills/create failed for "${name}":`, (e as Error).message);
    res.status(500).json({ error: `Skill creation failed: ${(e as Error).message}` });
  }
}
