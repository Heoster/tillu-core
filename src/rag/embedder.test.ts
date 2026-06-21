import { describe, it, expect } from "vitest";
import { cosineSimilarity } from "./embedder";

describe("rag/embedder — cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    const vec = [1, 2, 3, 4, 5];
    expect(cosineSimilarity(vec, vec)).toBeCloseTo(1, 5);
  });

  it("returns 0 for orthogonal vectors", () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5);
  });

  it("returns -1 for opposite vectors", () => {
    const a = [1, 0, 0];
    const b = [-1, 0, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1, 5);
  });

  it("returns 0 for empty vectors", () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it("returns 0 for mismatched lengths", () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });

  it("handles zero vectors", () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
  });

  it("computes correct similarity for known vectors", () => {
    const a = [1, 2, 3];
    const b = [4, 5, 6];
    // dot = 4+10+18 = 32
    // |a| = sqrt(14) ≈ 3.7417
    // |b| = sqrt(77) ≈ 8.7749
    // cos = 32 / (3.7417 * 8.7749) ≈ 0.9746
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.9746, 3);
  });

  it("is symmetric", () => {
    const a = [1, 3, -5, 7];
    const b = [2, -1, 4, 6];
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a), 10);
  });

  it("handles single-element vectors", () => {
    expect(cosineSimilarity([5], [3])).toBeCloseTo(1, 5);
    expect(cosineSimilarity([5], [-3])).toBeCloseTo(-1, 5);
  });

  it("handles large vectors", () => {
    const size = 768; // Jina embedding dimension
    const a = Array.from({ length: size }, (_, i) => Math.sin(i));
    const b = Array.from({ length: size }, (_, i) => Math.cos(i));
    const sim = cosineSimilarity(a, b);
    expect(sim).toBeGreaterThan(-1);
    expect(sim).toBeLessThan(1);
  });
});
