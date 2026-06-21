/**
 * skill-engine.ts — YAML skill loader and executor.
 *
 * Loads skills from tillu-skills/ at startup.
 * Hot-reloads on file change.
 * Matches voice input against skill triggers.
 * Executes skill steps using the agentic loop tools.
 */

import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { v4 as uuidv4 } from "uuid";
import type { Skill, SkillStep } from "../types";
import { emitToUI } from "./presence";
import { search, formatSearchResult } from "../tools/search.tool";
import { getNews, getWeather, formatNews, formatWeather } from "../tools/news-weather.tool";
import { readCalendar, addCalendarEvent } from "./calendar-helpers";
import { searchMemory, writeMemory, recordSkillFeedback } from "../tools/memory.tool";
import { speak } from "../tools/voice.tool";
import { executeAction, isHandsConnected } from "../tools/hands.tool";
import { flowObserver } from "./flow-observer";

// ─── Skill registry ───────────────────────────────────────────────────────────

const skills = new Map<string, Skill>();
let skillsDir = "";

export function loadSkills(dir: string): void {
  skillsDir = dir;
  if (!fs.existsSync(dir)) {
    console.warn(`[SkillEngine] Skills directory not found: ${dir}`);
    return;
  }

  _loadAll(dir);

  // Hot-reload on file changes
  fs.watch(dir, { recursive: true }, (event, filename) => {
    if (filename?.endsWith(".yaml") || filename?.endsWith(".yml")) {
      console.log(`[SkillEngine] Reloading: ${filename}`);
      _loadAll(dir);
    }
  });

  console.log(`[SkillEngine] Loaded ${skills.size} skills from ${dir}`);
}

function _loadAll(dir: string): void {
  skills.clear();
  _loadDir(dir);
}

function _loadDir(dir: string): void {
  if (!fs.existsSync(dir)) return;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      _loadDir(fullPath);
    } else if (entry.name.endsWith(".yaml") || entry.name.endsWith(".yml")) {
      try {
        const raw = fs.readFileSync(fullPath, "utf-8");
        const skill = yaml.load(raw) as Skill;
        if (skill?.skill) {
          skills.set(skill.skill, skill);
        }
      } catch (e) {
        console.warn(`[SkillEngine] Failed to load ${fullPath}:`, (e as Error).message);
      }
    }
  }
}

export function getSkills(): Skill[] {
  return Array.from(skills.values());
}

export function getSkill(name: string): Skill | undefined {
  return skills.get(name);
}

// ─── Trigger matching ─────────────────────────────────────────────────────────

/**
 * Find a skill whose voice_commands match the user input.
 * Returns the first match (case-insensitive, partial match allowed).
 */
export function matchSkill(userInput: string): Skill | null {
  const input = userInput.toLowerCase().trim();

  for (const skill of skills.values()) {
    const commands = skill.trigger?.voice_commands ?? [];
    for (const cmd of commands) {
      if (input.includes(cmd.toLowerCase()) || cmd.toLowerCase().includes(input)) {
        return skill;
      }
    }
  }
  return null;
}

// ─── Skill execution ──────────────────────────────────────────────────────────

export interface SkillRunResult {
  success: boolean;
  steps_completed: number;
  steps_total: number;
  latency_ms: number;
  error?: string;
}

/**
 * Execute a skill by name.
 * Resolves {variable} interpolation in step params.
 */
export async function runSkill(skillName: string): Promise<SkillRunResult> {
  const skill = skills.get(skillName);
  if (!skill) {
    const result = { success: false, steps_completed: 0, steps_total: 0, latency_ms: 0, error: `Skill not found: ${skillName}` };
    flowObserver.skillCompleted(skillName, false, 0);
    return result;
  }

  const executionId = uuidv4();
  const start = Date.now();
  const variables: Record<string, unknown> = {};
  let stepsCompleted = 0;

  flowObserver.skillStarted(skillName);

  for (const step of skill.steps) {
    try {
      const result = await executeSkillStep(step, variables);
      stepsCompleted++;

      // Save result to variables if save_as is specified
      if (step.save_as && result !== null) {
        variables[step.save_as] = result;
      }
    } catch (e) {
      const err = (e as Error).message;
      console.warn(`[SkillEngine] Step failed in ${skillName}: ${err}`);

      const onFailure = step.on_failure ?? "abort";
      if (onFailure === "abort") {
        const latency = Date.now() - start;
        void recordSkillFeedback(skillName, executionId, false, stepsCompleted, skill.steps.length, latency);
        flowObserver.skillCompleted(skillName, false, latency);
        return { success: false, steps_completed: stepsCompleted, steps_total: skill.steps.length, latency_ms: latency, error: err };
      }
      // skip or retry — for now just skip
    }
  }

  const latency = Date.now() - start;
  void recordSkillFeedback(skillName, executionId, true, stepsCompleted, skill.steps.length, latency);
  flowObserver.skillCompleted(skillName, true, latency);

  return { success: true, steps_completed: stepsCompleted, steps_total: skill.steps.length, latency_ms: latency };
}

// ─── Step executor ────────────────────────────────────────────────────────────

async function executeSkillStep(step: SkillStep, vars: Record<string, unknown>): Promise<unknown> {
  // Resolve {variable} interpolation in params
  const params = resolveParams(step.params ?? {}, vars);
  const action = step.action;

  switch (action) {
    case "news": {
      const result = await getNews(params.query as string ?? "India top headlines");
      return { summary: formatNews(result), articles: result.articles };
    }

    case "weather": {
      const city = params.city as string ?? "Muzaffarnagar";
      const result = await getWeather(city);
      return { ...result, summary: formatWeather(result) };
    }

    case "search": {
      const result = await search(params.query as string ?? "", "fast", "general");
      return { summary: formatSearchResult(result), ...result };
    }

    case "memory":
    case "memory_read": {
      const memories = await searchMemory(params.query as string ?? "", 5) as Array<{ content: string }>;
      return { summary: memories.map(m => m.content).join("; "), items: memories };
    }

    case "memory_write": {
      await writeMemory(params.content as string, params.type as string ?? "fact", "normal");
      return { saved: true };
    }

    case "voice":
    case "speak": {
      const text = resolveTemplate(params.text as string ?? "", vars);
      const audioUrl = await speak(text, params.lang as string ?? "hi-en");
      if (audioUrl) {
        emitToUI({ type: "response_audio", audio_url: audioUrl });
      }
      emitToUI({ type: "response_text", text });
      return { audio_url: audioUrl, text };
    }

    case "open_browser": {
      emitToUI({ type: "open_browser" });
      return { opened: true };
    }

    case "hands": {
      if (!isHandsConnected()) {
        console.warn("[SkillEngine] Hands not connected, skipping step");
        return null;
      }
      const result = await executeAction(step.action, params);
      return { ...result, summary: result.success ? "Hands action completed" : undefined };
    }

    case "calendar": {
      const calAction = params.action as string ?? "read";
      if (calAction === "read") {
        return readCalendar(params.filter as string ?? "today");
      } else if (calAction === "add") {
        return addCalendarEvent(params.event as Record<string, unknown> ?? {});
      }
      throw new Error(`Unknown calendar action: ${calAction}`);
    }

    default:
      throw new Error(`Unknown skill step action: ${action}`);
  }
}

// ─── Variable interpolation ───────────────────────────────────────────────────

function resolveParams(params: Record<string, unknown>, vars: Record<string, unknown>): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    resolved[k] = typeof v === "string" ? resolveTemplate(v, vars) : v;
  }
  return resolved;
}

function resolveTemplate(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{([^}]+)\}/g, (_, path) => {
    const parts = path.split(".");
    let val: unknown = vars;
    for (const part of parts) {
      val = (val as Record<string, unknown>)?.[part];
    }
    return val !== undefined && val !== null ? String(val) : `{${path}}`;
  });
}

// ─── Skill creation from voice ────────────────────────────────────────────────

export async function createSkillFromVoice(
  name: string,
  trigger: string,
  steps: SkillStep[],
  description = ""
): Promise<boolean> {
  if (!skillsDir) return false;

  const skill: Skill = {
    skill: name,
    description: description || `Custom skill: ${name}`,
    version: "1.0",
    created_by: "heoster",
    trigger: { voice_commands: [trigger] },
    steps,
    policy: { require_confirmation: false, response_format: "voice" },
  };

  const customDir = path.join(skillsDir, "custom");
  if (!fs.existsSync(customDir)) {
    fs.mkdirSync(customDir, { recursive: true });
  }

  const filePath = path.join(customDir, `${name}.yaml`);
  try {
    fs.writeFileSync(filePath, yaml.dump(skill), "utf-8");
    skills.set(name, skill);
    console.log(`[SkillEngine] Created skill: ${name} → ${filePath}`);
    return true;
  } catch (e) {
    console.error(`[SkillEngine] Failed to create skill: ${(e as Error).message}`);
    return false;
  }
}
