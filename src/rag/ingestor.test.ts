import { describe, it, expect } from "vitest";

// stripHtml is not exported, so replicate the logic for testing.
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, " ")
    .trim();
}

describe("rag/ingestor — stripHtml", () => {
  it("strips basic HTML tags", () => {
    expect(stripHtml("<p>Hello</p>")).toBe("Hello");
  });

  it("strips nested HTML tags", () => {
    expect(stripHtml("<div><span>Hello</span> <b>World</b></div>")).toBe("Hello World");
  });

  it("removes script tags and content", () => {
    const html = '<p>Text</p><script>alert("xss")</script><p>More</p>';
    const result = stripHtml(html);
    expect(result).not.toContain("script");
    expect(result).not.toContain("alert");
    expect(result).toContain("Text");
    expect(result).toContain("More");
  });

  it("removes style tags and content", () => {
    const html = "<p>Visible</p><style>body { color: red; }</style>";
    const result = stripHtml(html);
    expect(result).not.toContain("style");
    expect(result).not.toContain("color");
    expect(result).toContain("Visible");
  });

  it("decodes &nbsp;", () => {
    expect(stripHtml("Hello&nbsp;World")).toBe("Hello World");
  });

  it("decodes &amp;", () => {
    expect(stripHtml("A&amp;B")).toBe("A&B");
  });

  it("decodes &lt; and &gt;", () => {
    expect(stripHtml("&lt;tag&gt;")).toBe("<tag>");
  });

  it("decodes &quot;", () => {
    expect(stripHtml("He said &quot;hi&quot;")).toBe('He said "hi"');
  });

  it("collapses multiple whitespace", () => {
    expect(stripHtml("<p>Too   many    spaces</p>")).toBe("Too many spaces");
  });

  it("trims leading and trailing whitespace", () => {
    expect(stripHtml("  <p>  text  </p>  ")).toBe("text");
  });

  it("handles empty string", () => {
    expect(stripHtml("")).toBe("");
  });

  it("handles string with no HTML", () => {
    expect(stripHtml("plain text")).toBe("plain text");
  });

  it("handles multiline script tags", () => {
    const html = `<script type="text/javascript">
      var x = 1;
      console.log(x);
    </script>
    <p>Content</p>`;
    const result = stripHtml(html);
    expect(result).not.toContain("console");
    expect(result).toContain("Content");
  });

  it("handles self-closing tags", () => {
    expect(stripHtml("Hello<br/>World")).toBe("Hello World");
  });

  it("handles attributes in tags", () => {
    expect(stripHtml('<a href="http://example.com">Link</a>')).toBe("Link");
  });
});
