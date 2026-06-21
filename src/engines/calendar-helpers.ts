/**
 * calendar-helpers.ts — Shared calendar read/add logic.
 *
 * Extracts the calendar-read switch cases that were duplicated verbatim
 * between agentic-loop.ts executeStep() and skill-engine.ts executeSkillStep().
 */

import { getUpcomingEvents, addEvent, getSchoolSchedule } from "./calendar";
import { searchMemory } from "../tools/memory.tool";
import type { CalendarEvent } from "../types";

export interface CalendarReadResult {
  success: boolean;
  output: unknown;
  summary: string;
  error?: string;
}

/**
 * Read calendar data for a given filter ("today", "week", "exams", or freeform).
 */
export async function readCalendar(filter = "today"): Promise<CalendarReadResult> {
  if (filter === "today" || filter === "week") {
    const today = new Date().toLocaleDateString("en-US", { weekday: "long" });
    const schedule = getSchoolSchedule(today);
    const days = filter === "week" ? 7 : 1;
    const events = await getUpcomingEvents(days);
    const eventSummary = events.length > 0
      ? events.map(e => `${e.title} in ${e.days_remaining} day${e.days_remaining === 1 ? "" : "s"}`).join("; ")
      : "No upcoming events";
    const summary = `Today (${today}): ${schedule}. Upcoming: ${eventSummary}`;
    return { success: true, output: { schedule, events }, summary };
  }

  if (filter === "exams") {
    const events = await getUpcomingEvents(365);
    const exams = events.filter(
      e => e.title.toLowerCase().includes("exam") || e.title.toLowerCase().includes("board")
    );
    const summary = exams.length > 0
      ? exams.map(e => `${e.title}: ${e.days_remaining} days remaining`).join("; ")
      : "No upcoming exams found";
    return { success: true, output: exams, summary };
  }

  // Generic: search memory for events matching filter
  const memories = await searchMemory(`calendar events ${filter}`, 5) as Array<{ content: string }>;
  const summary = memories.length > 0
    ? memories.map(m => m.content).join("; ")
    : `No ${filter} events found`;
  return { success: true, output: memories, summary };
}

/**
 * Add a calendar event from raw params.
 */
export async function addCalendarEvent(
  raw: Record<string, unknown>
): Promise<CalendarReadResult> {
  const event: CalendarEvent = {
    title:    String(raw.title ?? "Untitled"),
    date:     String(raw.date ?? new Date().toISOString().split("T")[0]),
    time:     raw.time ? String(raw.time) : undefined,
    category: (raw.category as CalendarEvent["category"]) ?? "personal",
    notes:    raw.notes ? String(raw.notes) : undefined,
  };
  await addEvent(event);
  return {
    success: true,
    output: { saved: true },
    summary: `Added: ${event.title} on ${event.date}`,
  };
}
