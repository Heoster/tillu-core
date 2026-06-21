import { describe, it, expect } from "vitest";
import {
  heosterProfile,
  classifierPrompt,
  plannerPrompt,
  writerPrompt,
  wakeUpPrompt,
  proactivePrompt,
  morningBriefingPrompt,
} from "./prompts";

describe("brain/prompts", () => {
  describe("heosterProfile", () => {
    it("includes Heoster's nickname", () => {
      const profile = heosterProfile();
      expect(profile).toContain("Heoster");
    });

    it("includes TILLU identity", () => {
      const profile = heosterProfile();
      expect(profile).toContain("TILLU");
    });

    it("includes school info", () => {
      const profile = heosterProfile();
      expect(profile).toContain("Maples Academy");
    });

    it("includes timezone info", () => {
      const profile = heosterProfile();
      expect(profile).toContain("Asia/Kolkata");
    });

    it("includes class info", () => {
      const profile = heosterProfile();
      expect(profile).toContain("Class 12");
    });
  });

  describe("classifierPrompt", () => {
    it("includes user input", () => {
      const prompt = classifierPrompt("what is the weather", "context");
      expect(prompt).toContain("what is the weather");
    });

    it("includes context summary", () => {
      const prompt = classifierPrompt("test", "user is browsing");
      expect(prompt).toContain("user is browsing");
    });

    it("lists all intent types", () => {
      const prompt = classifierPrompt("test", "ctx");
      expect(prompt).toContain("question");
      expect(prompt).toContain("search");
      expect(prompt).toContain("system_action");
      expect(prompt).toContain("conversation");
      expect(prompt).toContain("multi_step");
    });

    it("requests JSON-only output", () => {
      const prompt = classifierPrompt("test", "ctx");
      expect(prompt).toContain("ONLY valid JSON");
    });
  });

  describe("plannerPrompt", () => {
    it("includes intent and user input", () => {
      const prompt = plannerPrompt("search", "find news", "ctx", "tool schema");
      expect(prompt).toContain("search");
      expect(prompt).toContain("find news");
    });

    it("includes tool schema", () => {
      const prompt = plannerPrompt("search", "test", "ctx", "my-tool-schema");
      expect(prompt).toContain("my-tool-schema");
    });

    it("includes context summary", () => {
      const prompt = plannerPrompt("search", "test", "user idle", "tools");
      expect(prompt).toContain("user idle");
    });
  });

  describe("writerPrompt", () => {
    it("includes Heoster profile", () => {
      const prompt = writerPrompt("hello", "results", "context");
      expect(prompt).toContain("TILLU");
      expect(prompt).toContain("Heoster");
    });

    it("includes user input and tool results", () => {
      const prompt = writerPrompt("tell me news", "breaking: AI advances", "ctx");
      expect(prompt).toContain("tell me news");
      expect(prompt).toContain("breaking: AI advances");
    });

    it("includes user state when provided", () => {
      const prompt = writerPrompt("hi", "results", "ctx", "focused");
      expect(prompt).toContain("focused");
    });

    it("shows unknown when user state is undefined", () => {
      const prompt = writerPrompt("hi", "results", "ctx");
      expect(prompt).toContain("unknown");
    });
  });

  describe("wakeUpPrompt", () => {
    it("includes correct greeting for morning", () => {
      const prompt = wakeUpPrompt("morning", "", "", "", "");
      expect(prompt).toContain("Good morning Heoster!");
    });

    it("includes correct greeting for evening", () => {
      const prompt = wakeUpPrompt("evening", "", "", "", "");
      expect(prompt).toContain("Good evening Heoster!");
    });

    it("includes last session summary when provided", () => {
      const prompt = wakeUpPrompt("morning", "worked on math", "", "", "");
      expect(prompt).toContain("worked on math");
    });

    it("shows fallback for empty fields", () => {
      const prompt = wakeUpPrompt("morning", "", "", "", "");
      expect(prompt).toContain("No previous session found");
      expect(prompt).toContain("No events today");
    });
  });

  describe("proactivePrompt", () => {
    it("includes trigger and context", () => {
      const prompt = proactivePrompt("birthday_alert", "user online", "data");
      expect(prompt).toContain("birthday_alert");
      expect(prompt).toContain("user online");
    });

    it("includes data when provided", () => {
      const prompt = proactivePrompt("test", "ctx", "exam in 3 days");
      expect(prompt).toContain("exam in 3 days");
    });

    it("shows none when data is empty", () => {
      const prompt = proactivePrompt("test", "ctx", "");
      expect(prompt).toContain("none");
    });
  });

  describe("morningBriefingPrompt", () => {
    it("includes all input sections", () => {
      const prompt = morningBriefingPrompt("headlines", "sunny 35C", "physics lab", "friend birthday");
      expect(prompt).toContain("headlines");
      expect(prompt).toContain("sunny 35C");
      expect(prompt).toContain("physics lab");
      expect(prompt).toContain("friend birthday");
    });

    it("includes Heoster profile", () => {
      const prompt = morningBriefingPrompt("", "", "", "");
      expect(prompt).toContain("TILLU");
      expect(prompt).toContain("Heoster");
    });
  });
});
