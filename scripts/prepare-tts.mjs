#!/usr/bin/env node
/**
 * prepare-tts.mjs — copies piper-phonemize WASM + espeak-ng-data + ONNX Runtime
 * into public/tts/ so they're served statically by Vite.
 *
 * Run after `npm install`:
 *   node scripts/prepare-tts.mjs
 *
 * Also generates public/tts/espeak-ng-data/manifest.json listing all data files
 * so the browser knows what to pre-load into MEMFS.
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PKG = join(ROOT, "node_modules", "piper-phonemize");
const PUB = join(ROOT, "public", "tts");

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function walkFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

// ── 1. Copy piper-phonemize WASM binary + patch wrapper for browser ──────

console.log("Copying piper-phonemize WASM...");
ensureDir(PUB);

// WASM binary — copy as-is
copyFileSync(
  join(PKG, "piper-phonemize-wasm-nodejs.wasm"),
  join(PUB, "piper-phonemize.wasm")
);

// JS wrapper — patch for browser: (a) prepend require shim for Node builtins,
// (b) strip NODERAWFS so it uses MEMFS instead of Node.js fs
const wrapperSrc = join(PKG, "piper-phonemize-wasm-nodejs.js");
let wrapperCode = readFileSync(wrapperSrc, "utf-8");

// Prepend a require() shim so the wrapper works in browser AND Web Workers.
// The shim provides minimal implementations of Node.js builtins that the
// Emscripten wrapper references unconditionally (require("path"), etc.).
// Comprehensive Node.js path module polyfill — the Emscripten wrapper
// calls path.isAbsolute, path.posix.resolve, path.posix.relative, etc.
const requireShim = `
var __p={
isAbsolute:function(p){return"/"===p[0]},
normalize:function(p){var a=p.split("/"),r=[];for(var i=0;i<a.length;i++){if(""===a[i]||"."===a[i])continue;if(".."===a[i]){if(r.length&&".."!==r[r.length-1])r.pop();else if(!p[0]||"/"!==p[0])r.push("..")}else r.push(a[i])}var s=r.join("/");return"/"===p[0]?"/"+s:s||"."},
resolve:function(){var p="",abs=false;for(var i=arguments.length-1;i>=-1&&!abs;i--){var seg=i>=0?arguments[i]:"/";if(!seg)continue;p=seg+"/"+p;abs="/"===seg[0]}p=__p.normalize(p);if(!abs&&"."!==p)p="/"+p;return p||"/"},
relative:function(f,t){f=__p.resolve(f);t=__p.resolve(t);var fa=f.split("/"),ta=t.split("/"),cl=0;while(cl<fa.length&&cl<ta.length&&fa[cl]===ta[cl])cl++;var up=fa.length-cl,rel="";for(var i=0;i<up;i++)rel+="../";for(var i=cl;i<ta.length;i++){if(i>cl)rel+="/";rel+=ta[i]}return rel||"."},
dirname:function(p){var i=p.lastIndexOf("/");if(i<0)return".";if(0===i)return"/";return p.slice(0,i)},
basename:function(p,ext){var b=p.split("/").pop()||"";if(ext&&b.endsWith(ext))b=b.slice(0,-ext.length);return b},
extname:function(p){var i=p.lastIndexOf(".");return i<0?"":p.slice(i)},
join:function(){var p=[];for(var i=0;i<arguments.length;i++){var s=arguments[i];if(!s)continue;if("string"!==typeof s)throw new TypeError("path.join args must be strings");if(s[0]==="/")p=[s];else p.push(s)}var j=__p.normalize(p.join("/"));return j||"."},
sep:"/",delimiter:""};
__p.posix=__p;__p.win32=__p;
if(typeof require==="undefined"){globalThis.require=function(m){return"path"===m?__p:{}};}
var __W=function(u,o){this.postMessage=function(m){var s=this;if(m&&"object"===typeof m&&("load"===m.cmd||m.__emscripten_init)){setTimeout(function(){if(s.onmessage)s.onmessage({data:{__emscripten_thread_ready:true,threadid:1}})},1)}};this.terminate=function(){};this.addEventListener=function(){};this.removeEventListener=function(){};this.onmessage=null;this.onerror=null};
globalThis.Worker=__W;
`;
wrapperCode = requireShim + wrapperCode;

// Remove the NODERAWFS environment check that throws in browser
wrapperCode = wrapperCode.replace(
  'throw new Error("NODERAWFS is currently only supported on Node.js environment.")',
  '/* patched: skip NODERAWFS */'
);

// Prevent NODERAWFS from replacing MEMFS filesystem operations
wrapperCode = wrapperCode.replace(
  "for(var _key in NODERAWFS){FS[_key]=_wrapNodeError(NODERAWFS[_key])}",
  "/* patched: keep MEMFS */"
);

// Patch 3: Skip createStandardStreams — it tries to create /dev/stdin
// symlinks via Node.js fs, which fails in browser MEMFS.
wrapperCode = wrapperCode.replace(
  /createStandardStreams\(\)\{/,
  'createStandardStreams(){return;' // early return, skip the rest
);

// Patch 4: Export FS on Module so browser code can write to MEMFS
wrapperCode = wrapperCode.replace(
  "moduleRtn=Module",
  'Module["FS"]=FS;Module["PATH"]=PATH;moduleRtn=Module'
);

// Patch 5: Skip pthread pool initialization — it creates Workers that fail
// in the browser. The phonemizer runs fine single-threaded.
wrapperCode = wrapperCode.replace(
  'var pthreadPoolReady=PThread.loadWasmModuleToAllWorkers();addRunDependency("loading-workers");await pthreadPoolReady;removeRunDependency("loading-workers")',
  '/* patched: skip pthread pool init */'
);

writeFileSync(join(PUB, "piper-phonemize-wasm.js"), wrapperCode);

const patchCount = (wrapperCode.match(/patched:/g) || []).length;
console.log(`  ✓ WASM binary + wrapper (${patchCount} browser patches applied)`);

// ── 2. Copy espeak-ng-data and generate manifest ─────────────────────────

console.log("Copying espeak-ng-data...");
const dataSrc = join(PKG, "espeak-ng-data");
const dataDst = join(PUB, "espeak-ng-data");
ensureDir(dataDst);

const dataFiles = walkFiles(dataSrc);
const manifest = [];

for (const src of dataFiles) {
  const rel = relative(dataSrc, src);
  const dst = join(dataDst, rel);
  ensureDir(dirname(dst));
  copyFileSync(src, dst);
  manifest.push(rel.replace(/\\/g, "/"));
}

writeFileSync(
  join(dataDst, "manifest.json"),
  JSON.stringify({ files: manifest.sort() })
);
console.log(`  ✓ ${dataFiles.length} data files + manifest.json`);

// ── 3. Copy ONNX Runtime Web ─────────────────────────────────────────────

console.log("Copying ONNX Runtime Web...");
const ortPkg = join(ROOT, "node_modules", "onnxruntime-web", "dist");
const ortDst = join(PUB, "dist");
ensureDir(ortDst);

if (existsSync(ortPkg)) {
  // Copy ALL ort files — the loader dynamically imports .mjs files at runtime
  const ortFiles = readdirSync(ortPkg).filter(f =>
    f.startsWith("ort.") || f.startsWith("ort-wasm-")
  );
  for (const f of ortFiles) {
    const src = join(ortPkg, f);
    if (statSync(src).isFile()) {
      copyFileSync(src, join(ortDst, f));
    }
  }
  console.log(`  ✓ ${ortFiles.length} ORT files copied`);
} else {
  console.warn("  ⚠ onnxruntime-web not installed. Run: npm install onnxruntime-web");
}

// ── 4. Summary ───────────────────────────────────────────────────────────

console.log("\n✅ TTS assets prepared in public/tts/");
// ── 4. Scan for speaker models and generate manifest ─────────────────────

console.log("\nScanning for speaker models...");
const modelsDir = join(PUB, "models");
ensureDir(modelsDir);

const speakerEntries = existsSync(modelsDir)
  ? readdirSync(modelsDir, { withFileTypes: true }).filter((e) => e.isDirectory())
  : [];

const speakers = [];
for (const entry of speakerEntries) {
  const dir = entry.name;
  const modelFile = join(modelsDir, dir, "model.onnx");
  const configFile = join(modelsDir, dir, "model.onnx.json");
  if (existsSync(modelFile) && existsSync(configFile)) {
    speakers.push({ id: dir, name: dir, dir });
    console.log(`  ✓ ${dir}`);
  } else {
    console.warn(`  ⚠ skipping "${dir}": missing model.onnx or model.onnx.json`);
  }
}

writeFileSync(
  join(modelsDir, "speakers.json"),
  JSON.stringify({ speakers }, null, 2)
);
console.log(`\n  speakers.json: ${speakers.length} speaker(s)`);

if (speakers.length === 0) {
  console.log("\n⚠ No speaker models found. Download them into public/tts/models/:");
  console.log("  hf download Revolab/vits speakers/sarah/model.onnx speakers/sarah/model.onnx.json --local-dir ./hf-dl");
  console.log("  mkdir -p public/tts/models/sarah");
  console.log("  cp ./hf-dl/speakers/sarah/* public/tts/models/sarah/");
  console.log("  node scripts/prepare-tts.mjs  # re-run to update manifest");
}

console.log("\n✅ Done.");
