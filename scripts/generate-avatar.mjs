#!/usr/bin/env node
/**
 * generate-avatar.mjs — Generate a PNGTuber character sheet via OpenAI API,
 * then automatically slice it into 4 sprites.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... node scripts/generate-avatar.mjs "your character description"
 *
 * Example:
 *   OPENAI_API_KEY=sk-... node scripts/generate-avatar.mjs \
 *     "a cheerful young woman with short dark blue hair, bright amber eyes, wearing a cream sweater"
 *
 * Requirements:
 *   - OPENAI_API_KEY environment variable
 *   - Internet access
 *
 * Output:
 *   character-sheet-<timestamp>.png  (full sheet, saved to project root)
 *   public/avatars/default/mouth_*.png  (4 sliced sprites)
 */

import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ── Config ───────────────────────────────────────────────────────────────

const API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
const CHARACTER = process.argv[2] || process.argv.slice(2).join(" ");

if (!API_KEY) {
  console.error("ERROR: Set OPENAI_API_KEY environment variable.");
  console.error("  Get one at: https://platform.openai.com/api-keys");
  console.error("  Then run:");
  console.error(
    '  OPENAI_API_KEY=sk-... node scripts/generate-avatar.mjs "character description"'
  );
  process.exit(1);
}

if (!CHARACTER) {
  console.error("ERROR: Provide a character description.");
  console.error('  node scripts/generate-avatar.mjs "a cheerful woman with blue hair..."');
  process.exit(1);
}

// ── Prompt ───────────────────────────────────────────────────────────────

const PROMPT = `Create a 2×2 grid character sheet for a VTuber avatar. Four identical panels arranged in a square grid, each showing the same character in bust-up portrait (head and shoulders), facing forward.

CHARACTER: ${CHARACTER}

LAYOUT (the ONLY thing that changes between panels):

TOP-LEFT panel:    Mouth CLOSED in a gentle smile, EYES OPEN looking at viewer.
TOP-RIGHT panel:   Mouth CLOSED in a gentle smile, EYES CLOSED (happy blink).
BOTTOM-LEFT panel: Mouth OPEN mid-speech (as if saying "ah"), EYES OPEN.
BOTTOM-RIGHT panel: Mouth OPEN mid-speech, EYES CLOSED.

CRITICAL CONSISTENCY RULES:
- The character's head, hair, body, and shoulders must be in the EXACT SAME pixel position in all four panels. Imagine the character is frozen in place and only the mouth and eyelids move.
- Identical lighting, colors, shading, line weight, and art style across all panels.
- Clean separation between panels — thin white grid lines dividing the four quadrants.
- Flat anime/cartoon illustration style with bold clean outlines and vibrant colors.
- Solid flat white background behind the character (no gradient, no scenery).

The output should be one single square image containing all four panels arranged in a 2×2 grid.`;

// ── Generate ─────────────────────────────────────────────────────────────

console.log(`Model:      ${MODEL}`);
console.log(`Character:  ${CHARACTER}`);
console.log(`\nGenerating character sheet...\n`);

const response = await fetch("https://api.openai.com/v1/images/generations", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: MODEL,
    prompt: PROMPT,
    size: "1024x1024",
    n: 1,
  }),
});

if (!response.ok) {
  const error = await response.text();
  console.error(`API error (${response.status}):`, error);
  process.exit(1);
}

const data = await response.json();
const image = data.data?.[0];

if (!image) {
  console.error("No image in response:", JSON.stringify(data));
  process.exit(1);
}

// Save the full sheet
const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const sheetPath = join(ROOT, `character-sheet-${timestamp}.png`);

if (image.b64_json) {
  // gpt-image-1 returns base64
  writeFileSync(sheetPath, Buffer.from(image.b64_json, "base64"));
} else if (image.url) {
  // dall-e-3 returns URL
  console.log("Downloading from URL...");
  const imgResp = await fetch(image.url);
  if (!imgResp.ok) {
    console.error(`Failed to download image: ${imgResp.status}`);
    process.exit(1);
  }
  const buffer = Buffer.from(await imgResp.arrayBuffer());
  writeFileSync(sheetPath, buffer);
} else {
  console.error("Unexpected response format:", JSON.stringify(image));
  process.exit(1);
}

console.log(`✅ Character sheet saved: ${sheetPath}`);

// ── Slice ────────────────────────────────────────────────────────────────

console.log("\nSlicing into 4 sprites...\n");

const sliceScript = join(__dirname, "slice-avatar.mjs");
const outputDir = join(ROOT, "public", "avatars", "default");

if (!existsSync(sliceScript)) {
  console.error("slice-avatar.mjs not found. Skipping slice step.");
  console.error(`Manually run: node scripts/slice-avatar.mjs "${sheetPath}"`);
  process.exit(0);
}

try {
  execFileSync("node", [sliceScript, sheetPath, outputDir], {
    stdio: "inherit",
  });
} catch {
  console.error("Slicing failed. The character sheet is saved — slice manually:");
  console.error(`  node scripts/slice-avatar.mjs "${sheetPath}"`);
  process.exit(1);
}

console.log("\n🎉 Avatar ready! Run `npm run dev` and refresh to see it.");
