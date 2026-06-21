import { routeWriter } from "./providers/router";
import { writerPrompt, wakeUpPrompt, morningBriefingPrompt, proactivePrompt } from "./prompts";
import { getISTTimeOfDay } from "../utils/time";

/**
 * Stage 3: Write the final response.
 * Uses the load-balanced router — equal load across Groq, Cerebras, OpenRouter.
 * Target latency: ~800ms
 */
export async function write(
  userInput: string,
  toolResults: string,
  contextSummary: string,
  userState?: string
): Promise<string> {
  const prompt = writerPrompt(userInput, toolResults, contextSummary, userState);
  const messages = [{ role: "user" as const, content: prompt }];

  try {
    return await routeWriter(messages, { maxTokens: 256, temperature: 0.7 });
  } catch (e) {
    console.warn("[Writer] All providers failed:", (e as Error).message.slice(0, 80));
    return `I processed your request, Heoster. ${toolResults ? `Here's what I found: ${toolResults.slice(0, 200)}` : ""}`;
  }
}

/**
 * Generate the wake-up greeting when Heoster comes online.
 */
export async function writeWakeUpGreeting(options: {
  lastSessionSummary: string;
  todayEvents: string;
  upcomingBirthdays: string;
  briefingContent: string;
}): Promise<string> {
  const timeOfDay = getISTTimeOfDay();
  const prompt = wakeUpPrompt(
    timeOfDay,
    options.lastSessionSummary,
    options.todayEvents,
    options.upcomingBirthdays,
    options.briefingContent
  );
  const messages = [{ role: "user" as const, content: prompt }];

  try {
    return await routeWriter(messages, { maxTokens: 200, temperature: 0.8 });
  } catch (e) {
    console.warn("[Writer] Wake-up greeting generation failed:", (e as Error).message);
    const greetings = { morning: "Good morning", afternoon: "Good afternoon", evening: "Good evening", night: "Good night" };
    return `${greetings[timeOfDay]} Heoster! I'm ready whenever you are.`;
  }
}

/**
 * Write the morning briefing during Dream Loop.
 */
export async function writeMorningBriefing(options: {
  newsHeadlines: string;
  weather: string;
  todayEvents: string;
  upcomingBirthdays: string;
}): Promise<string> {
  const prompt = morningBriefingPrompt(
    options.newsHeadlines,
    options.weather,
    options.todayEvents,
    options.upcomingBirthdays
  );
  const messages = [{ role: "user" as const, content: prompt }];

  try {
    return await routeWriter(messages, { maxTokens: 300, temperature: 0.6 });
  } catch (e) {
    console.warn("[Writer] Morning briefing generation failed:", (e as Error).message);
    return `Good morning Heoster! Here's your briefing: ${options.newsHeadlines.slice(0, 200)}`;
  }
}

/**
 * Write a proactive message Tillu initiates without user input.
 */
export async function writeProactiveMessage(options: {
  trigger: string;
  context: string;
  data?: string;
}): Promise<string> {
  const prompt = proactivePrompt(options.trigger, options.context, options.data ?? "");
  const messages = [{ role: "user" as const, content: prompt }];

  try {
    return await routeWriter(messages, { maxTokens: 150, temperature: 0.8 });
  } catch (e) {
    console.warn("[Writer] Proactive message generation failed:", (e as Error).message);
    return "";
  }
}
