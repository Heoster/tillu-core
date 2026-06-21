import { describe, it, expect, vi, afterEach } from "vitest";
import { getISTTime, getISTTimeOfDay, getISTHour, nowISO } from "./time";

describe("utils/time", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getISTTime", () => {
    it("returns a non-empty string", () => {
      const result = getISTTime();
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("formats in en-IN locale", () => {
      const result = getISTTime();
      // en-IN medium date style typically produces something like "21 Jun 2026"
      expect(result).toMatch(/\d/);
    });
  });

  describe("getISTTimeOfDay", () => {
    it("returns morning for 5-11", () => {
      vi.spyOn(Date.prototype, "toLocaleString").mockReturnValue("8");
      expect(getISTTimeOfDay()).toBe("morning");
    });

    it("returns afternoon for 12-16", () => {
      vi.spyOn(Date.prototype, "toLocaleString").mockReturnValue("14");
      expect(getISTTimeOfDay()).toBe("afternoon");
    });

    it("returns evening for 17-20", () => {
      vi.spyOn(Date.prototype, "toLocaleString").mockReturnValue("19");
      expect(getISTTimeOfDay()).toBe("evening");
    });

    it("returns night for 21-4", () => {
      vi.spyOn(Date.prototype, "toLocaleString").mockReturnValue("23");
      expect(getISTTimeOfDay()).toBe("night");
    });

    it("returns night for hour 0 (midnight)", () => {
      vi.spyOn(Date.prototype, "toLocaleString").mockReturnValue("0");
      expect(getISTTimeOfDay()).toBe("night");
    });

    it("returns morning for boundary hour 5", () => {
      vi.spyOn(Date.prototype, "toLocaleString").mockReturnValue("5");
      expect(getISTTimeOfDay()).toBe("morning");
    });

    it("returns afternoon for boundary hour 12", () => {
      vi.spyOn(Date.prototype, "toLocaleString").mockReturnValue("12");
      expect(getISTTimeOfDay()).toBe("afternoon");
    });

    it("returns evening for boundary hour 17", () => {
      vi.spyOn(Date.prototype, "toLocaleString").mockReturnValue("17");
      expect(getISTTimeOfDay()).toBe("evening");
    });
  });

  describe("getISTHour", () => {
    it("returns a number", () => {
      const result = getISTHour();
      expect(typeof result).toBe("number");
    });

    it("returns value between 0 and 23", () => {
      const result = getISTHour();
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(23);
    });
  });

  describe("nowISO", () => {
    it("returns a valid ISO 8601 string", () => {
      const result = nowISO();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it("ends with Z (UTC)", () => {
      const result = nowISO();
      expect(result).toMatch(/Z$/);
    });
  });
});
