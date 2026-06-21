import { describe, it, expect } from "vitest";
import { getSchoolSchedule } from "./calendar";

describe("engines/calendar", () => {
  describe("getSchoolSchedule", () => {
    it("returns Monday schedule", () => {
      const result = getSchoolSchedule("Monday");
      expect(result).toContain("Physics");
      expect(result).toContain("Chemistry");
    });

    it("returns Tuesday schedule", () => {
      const result = getSchoolSchedule("Tuesday");
      expect(result).toContain("Maths");
      expect(result).toContain("English");
    });

    it("returns Wednesday schedule", () => {
      const result = getSchoolSchedule("Wednesday");
      expect(result).toContain("Physics");
      expect(result).toContain("Chemistry Lab");
    });

    it("returns Thursday schedule", () => {
      const result = getSchoolSchedule("Thursday");
      expect(result).toContain("Maths");
      expect(result).toContain("Physical Education");
    });

    it("returns Friday schedule", () => {
      const result = getSchoolSchedule("Friday");
      expect(result).toContain("Physics");
      expect(result).toContain("English");
    });

    it("returns Saturday schedule", () => {
      const result = getSchoolSchedule("Saturday");
      expect(result).toContain("Mock Tests");
    });

    it("returns no classes for Sunday", () => {
      const result = getSchoolSchedule("Sunday");
      expect(result).toBe("No school classes scheduled.");
    });

    it("is case-insensitive", () => {
      expect(getSchoolSchedule("monday")).toBe(getSchoolSchedule("Monday"));
      expect(getSchoolSchedule("TUESDAY")).toBe(getSchoolSchedule("Tuesday"));
    });

    it("returns no classes for invalid day", () => {
      expect(getSchoolSchedule("Funday")).toBe("No school classes scheduled.");
    });
  });
});
