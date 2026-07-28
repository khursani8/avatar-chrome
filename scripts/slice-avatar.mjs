#!/usr/bin/env node
/**
 * slice-avatar.mjs — Cut a 2×2 character sheet into 4 PNGTuber sprites.
 *
 * Usage:
 *   node scripts/slice-avatar.mjs <character-sheet.png> [output-dir]
 *
 * Default output dir: public/avatars/default/
 *
 * Expected sheet layout (2×2 grid):
 *
 *   ┌──────────────┬──────────────┐
 *   │ mouth_close  │ mouth_close  │
 *   │ eyes_open    │ eyes_close   │
 *   │ (resting)    │ (blinking)   │
 *   ├──────────────┼──────────────┤
 *   │ mouth_open   │ mouth_open   │
 *   │ eyes_open    │ eyes_close   │
 *   │ (talking)    │ (talk+blink) │
 *   └──────────────┴──────────────┘
 *
 * The image can be any size — each quadrant is automatically half the
 * width and half the height. Square images (e.g. 2048×2048) work best.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const input = process.argv[2];
const outputDir = process.argv[3]
  ? resolve(process.argv[3])
  : join(__dirname, "..", "public", "avatars", "default");

if (!input || !existsSync(input)) {
  console.error("Usage: node scripts/slice-avatar.mjs <character-sheet.png> [output-dir]");
  console.error("\nProvide a 2×2 grid PNG. See public/avatars/default/README.md for the prompt.");
  process.exit(1);
}

if (!existsSync(outputDir)) {
  mkdirSync(outputDir, { recursive: true });
}

// Each quadrant: crop=iw/2:ih/2:x:y
// ffmpeg expressions: iw=input width, ih=input height
const quadrants = [
  { name: "mouth_close_eyes_open.png",  crop: "iw/2:ih/2:0:0" },
  { name: "mouth_close_eyes_close.png", crop: "iw/2:ih/2:iw/2:0" },
  { name: "mouth_open_eyes_open.png",   crop: "iw/2:ih/2:0:ih/2" },
  { name: "mouth_open_eyes_close.png",  crop: "iw/2:ih/2:iw/2:ih/2" },
];

console.log(`Slicing: ${input}`);
console.log(`Output:  ${outputDir}\n`);

for (const { name, crop } of quadrants) {
  const outPath = join(outputDir, name);
  try {
    execFileSync("ffmpeg", [
      "-i", input,
      "-vf", `crop=${crop}`,
      "-y",  // overwrite
      outPath,
    ], { stdio: ["pipe", "pipe", "pipe"] }); // silence ffmpeg output
    console.log(`  ✓ ${name}`);
  } catch {
    console.error(`  ✗ ${name} — ffmpeg failed`);
    process.exit(1);
  }
}

console.log("\n✅ Done. All 4 sprites created.");
console.log("Run `npm run dev` and refresh to see your avatar.");
