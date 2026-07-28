/**
 * Browser phonemizer — loads piper-phonemize WASM directly in the browser.
 *
 * The Emscripten wrapper supports browser mode (ENVIRONMENT_IS_WEB). We load
 * it via <script> tag, instantiate the WASM module, then pre-load all
 * espeak-ng-data files into Emscripten's MEMFS (virtual filesystem) so that
 * espeak-ng can read them at runtime.
 *
 * No backend server needed — everything runs client-side.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const BASE = import.meta.env.BASE_URL;

let moduleInstance: any = null;
let initialized = false;
let initPromise: Promise<void> | null = null;

/** Load the Emscripten wrapper via <script> tag and instantiate the WASM module. */
async function loadWasmModule(): Promise<any> {
  // Preload the WASM binary as ArrayBuffer — bypasses Emscripten's internal
  // file loading which expects the original "nodejs" filename.
  const wasmUrl = `${BASE}tts/piper-phonemize.wasm`;
  const wasmResp = await fetch(wasmUrl);
  if (!wasmResp.ok) {
    throw new Error(`Failed to fetch WASM binary: ${wasmResp.status}`);
  }
  const wasmBinary = await wasmResp.arrayBuffer();

  // Wrapper JS now has require() shim baked in by prepare-tts.mjs
  await injectScript(`${BASE}tts/piper-phonemize-wasm.js`);

  const factory = (globalThis as any).Module;
  if (typeof factory !== "function") {
    throw new Error("piper-phonemize-wasm.js did not export a Module factory");
  }

  const mod = await factory({
    wasmBinary,
    locateFile: (path: string) => `${BASE}tts/${path}`,
    print: () => {},
    printErr: (msg: string) => console.warn("[phonemizer]", msg),
  });

  return mod;
}

/** Pre-load all espeak-ng-data files into Emscripten's MEMFS. */
async function preloadEspeakData(mod: any): Promise<void> {
  // Fetch the manifest listing all data files
  const resp = await fetch(`${BASE}tts/espeak-ng-data/manifest.json`);
  if (!resp.ok) {
    throw new Error(
      "espeak-ng-data/manifest.json not found. Run: node scripts/prepare-tts.mjs"
    );
  }
  const { files } = (await resp.json()) as { files: string[] };

  // Create the directory structure and load files in parallel batches
  const BATCH = 20;
  for (let i = 0; i < files.length; i += BATCH) {
    const batch = files.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (filepath) => {
        const url = `${BASE}tts/espeak-ng-data/${filepath}`;
        const data = await fetch(url).then((r) => {
          if (!r.ok) throw new Error(`Failed to fetch ${filepath}: ${r.status}`);
          return r.arrayBuffer();
        });
        const memfsPath = `/espeak-ng-data/${filepath}`;
        ensureMemfsDir(mod, memfsPath);
        mod.FS.writeFile(memfsPath, new Uint8Array(data));
      })
    );
  }
}

/** Ensure the parent directory exists in MEMFS. */
function ensureMemfsDir(mod: any, filePath: string): void {
  const parts = filePath.split("/").filter(Boolean);
  // Create all parent directories
  let current = "";
  for (let i = 0; i < parts.length - 1; i++) {
    current += "/" + parts[i];
    try {
      mod.FS.mkdir(current);
    } catch {
      // directory already exists — ignore
    }
  }
}

/** Inject a <script> tag and wait for it to load. */
function injectScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${src}"]`
    );
    if (existing) {
      if (existing.dataset.loaded === "true") return resolve();
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error(`Failed to load ${src}`)),
        { once: true }
      );
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.addEventListener(
      "load",
      () => {
        script.dataset.loaded = "true";
        resolve();
      },
      { once: true }
    );
    script.addEventListener(
      "error",
      () => reject(new Error(`Failed to load ${src}`)),
      { once: true }
    );
    document.head.appendChild(script);
  });
}

export async function initializePhonemizer(
  onProgress?: (msg: string | null) => void
): Promise<void> {
  if (initialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    onProgress?.("Loading phonemizer WASM...");
    moduleInstance = await loadWasmModule();

    onProgress?.("Loading voice data...");
    await preloadEspeakData(moduleInstance);

    // Initialize espeak-ng with the MEMFS path.
    // espeak-ng appends "/espeak-ng-data" to the dataDir itself.
    const dataDir = "/";
    const dataDirLen = moduleInstance.lengthBytesUTF8(dataDir) + 1;
    const dataDirPtr = moduleInstance._malloc(dataDirLen);
    moduleInstance.stringToUTF8(dataDir, dataDirPtr, dataDirLen);
    try {
      const ret = moduleInstance._PiperPhonemizeInitialize(dataDirPtr);
      if (ret < 0) {
        throw new Error("espeak-ng initialization failed");
      }
    } finally {
      moduleInstance._free(dataDirPtr);
    }

    initialized = true;
    onProgress?.(null);
    console.log("[phonemizer] initialized");
  })();

  return initPromise;
}

export function isPhonemizerReady(): boolean {
  return initialized;
}

/**
 * Phonemize text and return raw uint32 code points (one array per sentence).
 * These code points can be used directly as phoneme IDs when the model's
 * phoneme_id_map is empty (common for Revolab/vits exports).
 */
export function phonemizeToCodePoints(
  text: string,
  voice = "ms"
): number[][] | null {
  if (!initialized || !moduleInstance) {
    throw new Error("Phonemizer not initialized");
  }

  const mod = moduleInstance;
  const textLen = mod.lengthBytesUTF8(text) + 1;
  const voiceLen = mod.lengthBytesUTF8(voice) + 1;
  const textPtr = mod._malloc(textLen);
  const voicePtr = mod._malloc(voiceLen);
  mod.stringToUTF8(text, textPtr, textLen);
  mod.stringToUTF8(voice, voicePtr, voiceLen);

  try {
    const resultPtr = mod._PiperPhonemizeText(textPtr, voicePtr);
    if (resultPtr === 0) return null;

    try {
      const numSentences = mod._PiperPhonemizeResultGetNumSentences(resultPtr);
      const sentences: number[][] = [];

      for (let i = 0; i < numSentences; i++) {
        const numPhonemes = mod._PiperPhonemizeResultGetNumPhonemes(resultPtr, i);
        if (numPhonemes <= 0) {
          sentences.push([]);
          continue;
        }
        const phonemesPtr = mod._PiperPhonemizeResultGetPhonemes(resultPtr, i);
        if (phonemesPtr === 0) {
          sentences.push([]);
          continue;
        }
        const codePoints: number[] = [];
        for (let j = 0; j < numPhonemes; j++) {
          codePoints.push(mod.HEAPU32[(phonemesPtr >> 2) + j]);
        }
        sentences.push(codePoints);
      }

      return sentences;
    } finally {
      mod._PiperPhonemizeDestroyResult(resultPtr);
    }
  } finally {
    mod._free(textPtr);
    mod._free(voicePtr);
  }
}
