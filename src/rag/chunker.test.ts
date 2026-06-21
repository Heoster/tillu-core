import { describe, it, expect } from "vitest";
import {
  chunkByTokens,
  chunkBySentences,
  chunkByParagraphs,
  chunkMarkdown,
  smartChunk,
} from "./chunker";

describe("rag/chunker", () => {
  describe("chunkByTokens", () => {
    it("returns one chunk for short text", () => {
      const text = "Hello world";
      const chunks = chunkByTokens(text, 400, 80);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]!.text).toBe("Hello world");
      expect(chunks[0]!.index).toBe(0);
      expect(chunks[0]!.total).toBe(1);
    });

    it("splits long text into multiple chunks", () => {
      const text = "a".repeat(5000);
      const chunks = chunkByTokens(text, 400, 80);
      expect(chunks.length).toBeGreaterThan(1);
    });

    it("has consistent total across all chunks", () => {
      const text = "word ".repeat(1000);
      const chunks = chunkByTokens(text, 100, 20);
      for (const c of chunks) {
        expect(c.total).toBe(chunks.length);
      }
    });

    it("has sequential indices", () => {
      const text = "word ".repeat(1000);
      const chunks = chunkByTokens(text, 100, 20);
      for (let i = 0; i < chunks.length; i++) {
        expect(chunks[i]!.index).toBe(i);
      }
    });

    it("covers the entire text (no gaps at end)", () => {
      const text = "x".repeat(2000);
      const chunks = chunkByTokens(text);
      const lastChunk = chunks[chunks.length - 1]!;
      expect(lastChunk.endChar).toBe(text.length);
    });

    it("startChar of first chunk is 0", () => {
      const text = "test ".repeat(500);
      const chunks = chunkByTokens(text);
      expect(chunks[0]!.startChar).toBe(0);
    });
  });

  describe("chunkBySentences", () => {
    it("returns one chunk for single sentence", () => {
      const text = "This is a sentence.";
      const chunks = chunkBySentences(text);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]!.text).toBe("This is a sentence.");
    });

    it("groups sentences into chunks by maxSentences", () => {
      const text = "First. Second. Third. Fourth. Fifth. Sixth.";
      const chunks = chunkBySentences(text, 3, 0);
      expect(chunks.length).toBe(2);
    });

    it("handles text with no sentence terminators", () => {
      const text = "No period here";
      const chunks = chunkBySentences(text);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]!.text).toBe("No period here");
    });

    it("handles exclamation and question marks", () => {
      const text = "Hello! How are you? Fine.";
      const chunks = chunkBySentences(text, 5, 0);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]!.text).toContain("Hello!");
      expect(chunks[0]!.text).toContain("How are you?");
    });

    it("applies overlap correctly", () => {
      const text = "One. Two. Three. Four. Five.";
      const noOverlap = chunkBySentences(text, 2, 0);
      const withOverlap = chunkBySentences(text, 2, 1);
      expect(withOverlap.length).toBeGreaterThanOrEqual(noOverlap.length);
    });

    it("sets total correctly on all chunks", () => {
      const text = "A. B. C. D. E. F.";
      const chunks = chunkBySentences(text, 2, 0);
      for (const c of chunks) {
        expect(c.total).toBe(chunks.length);
      }
    });
  });

  describe("chunkByParagraphs", () => {
    it("returns one chunk for single paragraph", () => {
      const text = "Single paragraph without breaks.";
      const chunks = chunkByParagraphs(text);
      expect(chunks).toHaveLength(1);
    });

    it("splits on double newlines when paragraphs exceed maxChars", () => {
      const para1 = "A".repeat(40);
      const para2 = "B".repeat(40);
      const para3 = "C".repeat(40);
      const text = `${para1}\n\n${para2}\n\n${para3}`;
      const chunks = chunkByParagraphs(text, 50);
      expect(chunks.length).toBeGreaterThan(1);
    });

    it("merges small paragraphs into one chunk", () => {
      const text = "Short.\n\nAlso short.\n\nStill small.";
      const chunks = chunkByParagraphs(text, 5000);
      expect(chunks).toHaveLength(1);
    });

    it("filters out empty paragraphs", () => {
      const text = "First.\n\n\n\n\nSecond.";
      const chunks = chunkByParagraphs(text, 5000);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]!.text).toContain("First.");
      expect(chunks[0]!.text).toContain("Second.");
    });

    it("sets total correctly", () => {
      const longPara = "x".repeat(500);
      const text = `${longPara}\n\n${longPara}\n\n${longPara}`;
      const chunks = chunkByParagraphs(text, 600);
      for (const c of chunks) {
        expect(c.total).toBe(chunks.length);
      }
    });
  });

  describe("chunkMarkdown", () => {
    it("splits on headings", () => {
      const text = "# Heading 1\nContent 1\n## Heading 2\nContent 2";
      const chunks = chunkMarkdown(text);
      expect(chunks.length).toBeGreaterThanOrEqual(2);
    });

    it("keeps heading with its content", () => {
      const text = "## My Section\nSome content here.";
      const chunks = chunkMarkdown(text);
      expect(chunks[0]!.text).toContain("## My Section");
      expect(chunks[0]!.text).toContain("Some content here.");
    });

    it("handles content before any heading", () => {
      const text = "Preamble text\n## First Heading\nBody text";
      const chunks = chunkMarkdown(text);
      expect(chunks.length).toBe(2);
    });

    it("sub-chunks large sections", () => {
      const longContent = "word ".repeat(500);
      const text = `## Big Section\n${longContent}`;
      const chunks = chunkMarkdown(text, 200);
      expect(chunks.length).toBeGreaterThan(1);
    });

    it("handles h1, h2, h3 headings", () => {
      const text = "# H1\nContent1\n## H2\nContent2\n### H3\nContent3";
      const chunks = chunkMarkdown(text);
      expect(chunks.length).toBe(3);
    });
  });

  describe("smartChunk", () => {
    it("returns empty for empty string", () => {
      expect(smartChunk("")).toEqual([]);
    });

    it("returns empty for whitespace-only string", () => {
      expect(smartChunk("   ")).toEqual([]);
    });

    it("returns single chunk for short text", () => {
      const text = "Short text.";
      const chunks = smartChunk(text);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]!.text).toBe("Short text.");
    });

    it("uses markdown chunking for text with headings", () => {
      const body = "x".repeat(600);
      const text = `## Heading\n${body}\n## Another\n${body}`;
      const chunks = smartChunk(text);
      expect(chunks.length).toBeGreaterThanOrEqual(2);
    });

    it("uses paragraph chunking for text with double newlines", () => {
      const para = "x".repeat(600);
      const text = `${para}\n\n${para}`;
      const chunks = smartChunk(text);
      expect(chunks.length).toBeGreaterThanOrEqual(2);
    });

    it("uses token chunking for long prose without markers", () => {
      const text = "word ".repeat(1000);
      const chunks = smartChunk(text);
      expect(chunks.length).toBeGreaterThan(1);
    });

    it("respects maxCharsPerChunk option", () => {
      const body = "word ".repeat(200);
      const text = `## A\n${body}\n## B\n${body}`;
      const smallChunks = smartChunk(text, { maxCharsPerChunk: 200 });
      const bigChunks = smartChunk(text, { maxCharsPerChunk: 5000 });
      expect(smallChunks.length).toBeGreaterThanOrEqual(bigChunks.length);
    });
  });
});
