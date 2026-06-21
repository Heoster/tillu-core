import { v4 as uuidv4 } from "uuid";
import { runPipeline } from "../brain/pipeline";
import { executeAction, isHandsConnected } from "../tools/hands.tool";
import { search, formatSearchResult } from "../tools/search.tool";
import { getNews, getWeather, formatNews, formatWeather } from "../tools/news-weather.tool";
import { see } from "../tools/see.tool";
import { speak } from "../tools/voice.tool";
import { writeMemory, searchMemory, logAction } from "../tools/memory.tool";
import { emitToUI } from "./presence";
import { readCalendar, addCalendarEvent } from "./calendar-helpers";
import type { ActionStep, TilluOutput, TilluAction } from "../types";
import { registerConfirmation } from "../ws/ui-handler";
import { matchSkill, runSkill, createSkillFromVoice } from "./skill-engine";
import { evolveFromInteraction } from "./self-evolution";
import { flowObserver } from "./flow-observer";

export interface LoopInput {
  userInput: string;
  contextSummary: string;
  userState?: string;
  sessionId: string;
  image?: string;
  latestScreenshot?: string;
}

/**
 * The main agentic loop.
 *
 * Pipeline now handles cloud tools (search, memory_read, see) internally
 * so the writer gets real data. This loop handles:
 *   - Direct matching against skills (bypasses LLM pipeline for performance)
 *   - Delivering the response (text + audio) to UI
 *   - Executing desktop action steps (hands, browser, calendar, etc.)
 *   - Saving the interaction to memory
 *   - Firing the self-evolution engine to learn preference or skills
 */
export async function runAgenticLoop(input: LoopInput): Promise<void> {
  const { userInput, contextSummary, userState, sessionId } = input;
  const loopStart = Date.now();
  let loopSuccess = true;

  // 1. Check if input matches a skill trigger first (fast path — bypasses LLM)
  const matchedSkill = matchSkill(userInput);
  if (matchedSkill) {
    console.log(`[Loop] Skill match: "${matchedSkill.skill}"`);
    try {
      const result = await runSkill(matchedSkill.skill);
      loopSuccess = result.success;
      evolveFromInteraction(userInput, `Executed skill: ${matchedSkill.skill}`, sessionId)
        .catch(e => console.warn("[Loop] Self-evolution after skill failed:", (e as Error).message));
      console.log(`[Loop] Skill done: ${result.success} in ${result.latency_ms}ms`);
    } catch (e) {
      loopSuccess = false;
      console.error(`[Loop] Skill failed:`, (e as Error).message);
    }
    return;
  }

  emitToUI({ type: "thought", step: "Thinking...", icon: "brain" });

  let output: TilluOutput;
  let classification: import("../types").ClassifierOutput;

  try {
    const result = await runPipeline({
      userInput,
      contextSummary,
      userState,
      image: input.image,
      latestScreenshot: input.latestScreenshot,
    });
    output = result.output;
    classification = result.classification;

    console.log(
      `[Loop] Pipeline: ${result.latency_ms}ms | intent=${classification.intent}` +
      ` | has_response=${classification.has_response} | has_action=${classification.has_action}`
    );
  } catch (e) {
    const msg = (e as Error).message;
    console.error("[Loop] Pipeline failed:", msg);
    emitToUI({ type: "error", message: "Something went wrong processing your request.", recoverable: true });
    emitToUI({ type: "response_text", text: "Sorry Heoster, I ran into an error. Try again?" });
    return;
  }

  // Response and desktop action execute in parallel
  await Promise.all([
    output.response ? deliverResponse(output) : Promise.resolve(),
    output.action   ? executeActionPath(output, sessionId) : Promise.resolve(),
  ]);

  // Save interaction to memory (fire-and-forget)
  writeMemory(
    `Heoster asked: "${userInput.slice(0, 200)}"`,
    "event",
    "normal",
    sessionId
  ).catch(e => console.warn("[Loop] Memory write failed:", (e as Error).message));

  // Trigger self-evolution (fire-and-forget)
  if (output.response?.text) {
    evolveFromInteraction(userInput, output.response.text, sessionId)
      .catch(e => console.warn("[Loop] Self-evolution failed:", (e as Error).message));
  }

  console.log(`[Loop] Total: ${Date.now() - loopStart}ms`);
}

// ─── Deliver response to UI ───────────────────────────────────────────────────

async function deliverResponse(output: TilluOutput): Promise<void> {
  if (!output.response) return;

  emitToUI({ type: "response_text", text: output.response.text });

  const audioUrl = await speak(output.response.text, output.response.lang ?? "hi");
  if (audioUrl) {
    emitToUI({ type: "response_audio", audio_url: audioUrl });
  }
}

// ─── Execute desktop action steps ────────────────────────────────────────────

async function executeActionPath(output: TilluOutput, sessionId: string): Promise<void> {
  if (!output.action || output.action.plan.length === 0) return;

  const action = output.action;
  const actionStart = Date.now();

  emitToUI({ type: "action_start", action_id: action.id, plan: action.plan });

  // Confirmation gate
  if (action.requires_confirmation) {
    console.log(`[Loop] Action ${action.id} requires user confirmation. Pausing...`);
    registerConfirmation(action.id, () => {
      console.log(`[Loop] Action ${action.id} approved! Resuming execution...`);
      runActionSteps(action, sessionId, actionStart)
        .catch(e => console.error("[Loop] Confirmed action execution failed:", (e as Error).message));
    });
    emitToUI({
      type: "action_confirm",
      action_id: action.id,
      message: action.confirmation_message ?? "Confirm this action?",
      pending_step: action.plan[0],
    });
    return; // ui-handler resumes execution on confirm
  }

  await runActionSteps(action, sessionId, actionStart);
}

/**
 * Executes the queued action steps sequentially
 */
async function runActionSteps(action: TilluAction, sessionId: string, actionStart: number): Promise<void> {
  let allSucceeded = true;
  let stepsCompleted = 0;
  const toolResults: string[] = [];

  for (const step of action.plan) {
    flowObserver.actionStepStarted(step);
    emitToUI({ type: "action_step", action_id: action.id, step_id: step.id, status: "running" });

    const result = await executeStep(step);

    if (result.success) {
      step.status = "done";
      step.output = result.output;
      if (result.summary) toolResults.push(result.summary);
      emitToUI({ type: "action_step", action_id: action.id, step_id: step.id, status: "done", output: result.output });
      flowObserver.actionStepCompleted(step, true, result.output);
      stepsCompleted++;
    } else {
      step.status = "failed";
      step.error = result.error;
      allSucceeded = false;
      emitToUI({ type: "action_step", action_id: action.id, step_id: step.id, status: "failed", error: result.error });
      flowObserver.actionStepCompleted(step, false, result.output, result.error);
      break;
    }
  }

  emitToUI({ type: "action_done", action_id: action.id, success: allSucceeded });
  flowObserver.actionPathCompleted(allSucceeded, stepsCompleted);

  logAction(action.id, action.plan[0]?.action ?? "unknown", allSucceeded, undefined, Date.now() - actionStart)
    .catch(e => console.warn("[Loop] Action log failed:", (e as Error).message));

  if (toolResults.length > 0) {
    emitToUI({ type: "response_card", card_type: "action_result", data: { results: toolResults, success: allSucceeded } });
  }
}

// ─── Step executor — all tool types ──────────────────────────────────────────

export async function executeStep(step: ActionStep): Promise<{
  success: boolean; output: unknown; summary?: string; error?: string;
}> {
  try {
    switch (step.tool) {

      // ── Cloud: News ───────────────────────────────────────────────────────
      case "news": {
        emitToUI({ type: "thought", step: `Getting news: ${step.params.query as string ?? "..."}`, icon: "search" });
        const result = await getNews(step.params.query as string ?? "India top headlines");
        return { success: true, output: result, summary: formatNews(result) };
      }

      // ── Cloud: Weather ────────────────────────────────────────────────────
      case "weather": {
        const city = step.params.city as string ?? "Muzaffarnagar";
        emitToUI({ type: "thought", step: `Getting weather for ${city}...`, icon: "search" });
        const result = await getWeather(city);
        return { success: true, output: result, summary: formatWeather(result) };
      }

      // ── Cloud: Search ──────────────────────────────────────────────────────
      case "search": {
        emitToUI({ type: "thought", step: `Searching: ${step.params.query as string ?? "..."}`, icon: "search" });
        const result = await search(
          step.params.query as string,
          (step.params.mode as "fast" | "full") ?? "fast",
          (step.params.category as "general" | "news" | "videos") ?? "general"
        );
        return { success: true, output: result, summary: formatSearchResult(result) };
      }

      // ── Cloud: Vision ──────────────────────────────────────────────────────
      case "see": {
        emitToUI({ type: "thought", step: "Analyzing image...", icon: "eye" });
        const imgData = step.params.image as string ?? "";
        if (!imgData) return { success: false, output: null, error: "No image provided for see tool" };
        const result = await see(
          (step.params.task as "screen_read" | "ocr" | "describe" | "visual_qa") ?? "describe",
          imgData,
          step.params.question as string | undefined
        );
        return { success: true, output: result, summary: result.description };
      }

      // ── Cloud: Memory read ─────────────────────────────────────────────────
      case "memory": {
        const memAction = step.params.action as string ?? "read";
        if (memAction === "read" || step.action === "memory_read") {
          emitToUI({ type: "thought", step: "Reading memory...", icon: "brain" });
          const memories = await searchMemory(step.params.query as string ?? "", 5) as Array<{ content: string }>;
          const summary = memories.map(m => m.content).join("; ");
          return { success: true, output: memories, summary: summary || "No memories found" };
        } else {
          // memory_write
          await writeMemory(
            step.params.content as string,
            step.params.type as string ?? "fact",
            step.params.importance as string ?? "normal"
          );
          return { success: true, output: { saved: true }, summary: "Saved to memory" };
        }
      }

      // ── Cloud: Voice / TTS ─────────────────────────────────────────────────
      case "voice": {
        const audioUrl = await speak(step.params.text as string, (step.params.lang as string) ?? "hi");
        if (audioUrl) emitToUI({ type: "response_audio", audio_url: audioUrl });
        return { success: true, output: { audio_url: audioUrl } };
      }

      // ── Desktop: Hands ────────────────────────────────────────────────────
      case "hands": {
        if (!isHandsConnected()) return { success: false, output: null, error: "Tillu-Hands is not connected" };
        emitToUI({ type: "thought", step: `${step.params.action as string ?? step.action}...`, icon: "hand" });
        const result = await executeAction(step.params.action as string ?? step.action, step.params);
        return { success: result.success, output: result.output, error: result.error, summary: result.success ? `${step.action} completed` : undefined };
      }

      // ── Desktop: Browser (via Hands) ──────────────────────────────────────
      case "browser": {
        if (!isHandsConnected()) return { success: false, output: null, error: "Tillu-Hands is not connected" };
        emitToUI({ type: "thought", step: `Browsing ${step.params.url as string ?? "..."}`, icon: "browser" });
        const result = await executeAction(step.action, step.params);
        return { success: result.success, output: result.output, error: result.error };
      }

      // ── Open Tillu Browser via UI (Custom Tool) ────────────────────────────
      case "open_browser": {
        emitToUI({ type: "open_browser" });
        return { success: true, output: { opened: true } };
      }

      // ── Calendar (real engine — school schedule + exams + custom events) ──
      case "calendar": {
        emitToUI({ type: "thought", step: "Checking calendar...", icon: "calendar" });
        const calAction = step.params.action as string ?? "read";

        if (calAction === "read") {
          return readCalendar(step.params.filter as string ?? "today");
        } else if (calAction === "add") {
          return addCalendarEvent(step.params.event as Record<string, unknown> ?? {});
        }

        return { success: false, output: null, error: `Unknown calendar action: ${calAction}` };
      }

      // ── Create skill ──────────────────────────────────────────────────────
      case "create_skill": {
        emitToUI({ type: "thought", step: "Creating skill...", icon: "brain" });
        const ok = await createSkillFromVoice(
          step.params.name as string,
          step.params.trigger as string,
          (step.params.steps as Array<{ action: string; params?: Record<string, unknown> }> ?? []).map(s => ({
            action: s.action,
            params: s.params,
          })),
          step.params.description as string | undefined
        );
        return { success: ok, output: { created: step.params.name }, summary: ok ? `Skill "${step.params.name as string}" created` : "Skill creation failed" };
      }

      default:
        return { success: false, output: null, error: `Unknown tool: ${step.tool}` };
    }
  } catch (e) {
    return { success: false, output: null, error: (e as Error).message };
  }
}
