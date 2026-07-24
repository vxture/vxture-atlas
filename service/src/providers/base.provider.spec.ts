import { describe, it, expect } from "vitest";

import { joinEndpoint, parseJson } from "./base.provider";

// ── joinEndpoint ──────────────────────────────────────────────────────────────

describe("joinEndpoint", () => {
  it("handles trailing slash on base and leading slash on suffix", () => {
    expect(joinEndpoint("https://api.example.com/", "/chat")).toBe(
      "https://api.example.com/chat",
    );
  });

  it("handles base without trailing slash and suffix without leading slash", () => {
    expect(joinEndpoint("https://api.example.com", "chat")).toBe(
      "https://api.example.com/chat",
    );
  });

  it("handles base without trailing slash and suffix with leading slash", () => {
    expect(joinEndpoint("https://api.example.com", "/chat")).toBe(
      "https://api.example.com/chat",
    );
  });

  it("collapses multiple trailing slashes on base", () => {
    expect(joinEndpoint("https://api.example.com///", "chat")).toBe(
      "https://api.example.com/chat",
    );
  });

  it("collapses multiple leading slashes on suffix", () => {
    expect(joinEndpoint("https://api.example.com", "//chat/completions")).toBe(
      "https://api.example.com/chat/completions",
    );
  });

  it("handles a path-like base with trailing slash", () => {
    expect(
      joinEndpoint("https://api.example.com/v1/", "/chat/completions"),
    ).toBe("https://api.example.com/v1/chat/completions");
  });
});

// ── parseJson ─────────────────────────────────────────────────────────────────

describe("parseJson", () => {
  it("parses a valid JSON object", () => {
    expect(parseJson<{ ok: boolean }>('{"ok":true}')).toEqual({ ok: true });
  });

  it("parses a JSON array", () => {
    expect(parseJson<number[]>("[1,2,3]")).toEqual([1, 2, 3]);
  });

  it("parses a JSON string value", () => {
    expect(parseJson<string>('"hello"')).toBe("hello");
  });

  it("throws on empty string", () => {
    expect(() => parseJson("")).toThrow("Provider returned an empty response");
  });

  it("throws on whitespace-only string", () => {
    expect(() => parseJson("   ")).toThrow(
      "Provider returned an empty response",
    );
  });

  it("throws on invalid JSON", () => {
    expect(() => parseJson("{bad json}")).toThrow();
  });
});
