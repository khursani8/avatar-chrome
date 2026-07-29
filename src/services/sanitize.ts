/**
 * Sanitize LLM output — strips emoji, Markdown, and decorative symbols.
 * Keeps letters (all languages), numbers, basic punctuation, and spaces.
 */

export function sanitizeOutput(text: string): string {
  return text
    // Strip Markdown formatting
    .replace(/\*{1,2}(.*?)\*{1,2}/g, "$1")
    .replace(/_{1,2}(.*?)_{1,2}/g, "$1")
    .replace(/~{1,2}(.*?)~{1,2}/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/`{1,3}[\s\S]*?`{1,3}/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/^>\s+/gm, "")
    // Strip emoji and non-text symbols (keep letters, numbers, basic punctuation)
    .replace(
      /[^\p{L}\p{N}\s.,!?'":;\-()/%]/gu,
      ""
    )
    // Clean up leftover artifacts
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,!?])/g, "$1")
    .trim();
}
