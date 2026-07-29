/**
 * TTS Provider — browser-only Piper inference for Revolab/vits models.
 *
 * Pipeline (all client-side, no server):
 *   text → phonemizer WASM (espeak-ng ms voice) → phoneme IDs → ONNX Runtime Web → audio
 *
 * Speaker models live in public/tts/models/<speaker>/model.onnx[.json].
 * A speakers.json manifest lists available speakers.
 *
 * Run `node scripts/prepare-tts.mjs` after installing deps and adding models.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { initializePhonemizer, phonemizeToCodePoints } from "./phonemizer";
import { normalizeMalay } from "./normalizer";

const BASE = import.meta.env.BASE_URL;
// Where speaker models (model.onnx + model.onnx.json) are fetched from.
// Defaults to local /tts/models/ for dev. For production, set VITE_TTS_MODEL_BASE
// to a host that allows cross-origin reads (e.g. a public HuggingFace repo) so
// the large (>25MB) models don't have to be bundled into the static deploy.
const MODEL_BASE = import.meta.env.VITE_TTS_MODEL_BASE
  ? String(import.meta.env.VITE_TTS_MODEL_BASE)
  : `${BASE}tts/models/`;
const PHONEMIZER_VOICE = "ms"; // Malay espeak-ng voice

// ONNX Runtime Web is loaded from a pinned CDN (see main.tsx) to keep the
// static deploy small and avoid bundling the >25MB wasm files.
export const ORT_CDN_BASE =
  "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/";

// ort is loaded from public/tts/dist/ort.min.js via <script> tag in main.tsx
declare const ort: any;

export interface SpeakerInfo {
  id: string;
  name: string;
  dir: string;
}

interface LoadedSpeaker {
  session: any;
  config: any;
}

let ready = false;
let initPromise: Promise<void> | null = null;
let speakers: SpeakerInfo[] = [];
const loadedSessions = new Map<string, LoadedSpeaker>();
// In-flight speaker loads — dedup so preload + speak never double-load.
const loadingPromises = new Map<string, Promise<LoadedSpeaker>>();

export function isReady(): boolean {
  return ready;
}

export function getSpeakers(): SpeakerInfo[] {
  return speakers;
}

export async function initialize(
  onProgress?: (msg: string | null) => void,
  preferredSpeaker?: string
): Promise<void> {
  if (ready) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      // 1. Load phonemizer WASM
      console.log("[TTS] Step 1: Initializing phonemizer...");
      await initializePhonemizer(onProgress);
      console.log("[TTS] Step 1 done: phonemizer ready");

      // 2. Verify ONNX Runtime is available
      console.log("[TTS] Step 2: Checking ONNX Runtime...");
      if (typeof ort === "undefined") {
        throw new Error(
          "ONNX Runtime not loaded. Ensure public/tts/dist/ort.min.js exists."
        );
      }
      ort.env.wasm.wasmPaths = ORT_CDN_BASE;
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.simd = true;
      console.log("[TTS] Step 2 done: ORT available");

      // 3. Discover available speakers
      console.log("[TTS] Step 3: Loading speakers...");
      onProgress?.("Loading speaker list...");
      const manifestResp = await fetch(`${BASE}tts/models/speakers.json`);
      if (!manifestResp.ok) {
        throw new Error(
          "Speaker manifest not found. Add models to public/tts/models/ and run: node scripts/prepare-tts.mjs"
        );
      }
      const manifest = await manifestResp.json();
      speakers = manifest.speakers ?? [];

      if (speakers.length === 0) {
        throw new Error("No speakers found in manifest.");
      }

      // 4. Pre-load only the selected speaker (lazy-load others on switch)
      const targetId = preferredSpeaker && speakers.find((s) => s.id === preferredSpeaker)
        ? preferredSpeaker
        : speakers[0].id;
      console.log(`[TTS] Step 4: Loading speaker "${targetId}"...`);
      onProgress?.(`Loading ${targetId}...`);
      await ensureSpeakerLoaded(targetId);
      console.log(`[TTS] Step 4 done: ${targetId} loaded`);

      ready = true;
      onProgress?.(null);
      console.log(
        `[TTS] ready, speakers: ${speakers.map((s) => s.id).join(", ")}`
      );
    } catch (err) {
      initPromise = null;
      throw err;
    }
  })();

  return initPromise;
}

/** Whether a speaker's model is already loaded and ready to speak. */
export function isSpeakerLoaded(speakerId: string): boolean {
  return loadedSessions.has(speakerId);
}

/**
 * Start loading a speaker's model so it's ready before the user speaks.
 * Safe to call repeatedly — concurrent calls share one load (dedup'd) and
 * already-loaded speakers resolve immediately. `onStatus` reports progress.
 */
export async function preloadSpeaker(
  speakerId: string,
  onStatus?: (msg: string | null) => void
): Promise<void> {
  if (!ready) return;
  await ensureSpeakerLoaded(speakerId, onStatus);
}

/** Load a speaker's ONNX model + config if not already cached (dedup'd). */
async function ensureSpeakerLoaded(
  speakerId: string,
  onStatus?: (msg: string | null) => void
): Promise<LoadedSpeaker> {
  const cached = loadedSessions.get(speakerId);
  if (cached) return cached;
  const inFlight = loadingPromises.get(speakerId);
  if (inFlight) return inFlight;

  const promise = loadSpeakerSession(speakerId, onStatus);
  loadingPromises.set(speakerId, promise);
  try {
    return await promise;
  } finally {
    loadingPromises.delete(speakerId);
  }
}

async function loadSpeakerSession(
  speakerId: string,
  onStatus?: (msg: string | null) => void
): Promise<LoadedSpeaker> {
  const speaker = speakers.find((s) => s.id === speakerId);
  if (!speaker) throw new Error(`Unknown speaker: ${speakerId}`);

  // The 61MB model.onnx binary is fetched from MODEL_BASE (HuggingFace in prod).
  // The small model.onnx.json config is served LOCALLY — the HF export ships an
  // empty phoneme_id_map, which would leave every phoneme unmapped (silent audio).
  const modelUrl = `${MODEL_BASE}${speaker.dir}/model.onnx`;
  const configUrl = `${BASE}tts/models/${speaker.dir}/model.onnx.json`;
  console.log(`[TTS] Loading speaker ${speakerId} from ${modelUrl}`);
  onStatus?.(`Loading ${speaker.name || speaker.id} voice…`);

  const configResp = await fetch(configUrl);
  if (!configResp.ok) {
    throw new Error(`Config not found: ${speaker.dir}/model.onnx.json`);
  }
  const config = await configResp.json();
  console.log(`[TTS] Config:`, { sample_rate: config.audio?.sample_rate, voice: config.espeak?.voice, num_symbols: config.num_symbols });

  console.log(`[TTS] Creating ONNX session (61MB model, this takes a moment)...`);
  const session = await ort.InferenceSession.create(modelUrl, {
    executionProviders: ["wasm"],
    graphOptimizationLevel: "all",
  });
  console.log(`[TTS] ONNX session created, inputs:`, session.inputNames, "outputs:", session.outputNames);

  const loaded: LoadedSpeaker = { session, config };
  loadedSessions.set(speakerId, loaded);
  console.log(`[TTS] loaded speaker: ${speakerId}`);
  onStatus?.(null);
  return loaded;
}

export async function synthesize(
  text: string,
  options?: { speaker?: string; lengthScale?: number }
): Promise<{ audio: Float32Array; sampleRate: number }> {
  if (!ready) throw new Error("TTS not initialized");

  const speakerId = options?.speaker ?? speakers[0]?.id;
  if (!speakerId) throw new Error("No speaker selected");

  const { session, config } = await ensureSpeakerLoaded(speakerId);

  // Normalize text (numbers → Malay words) before phonemization
  const normalized = normalizeMalay(text);
  console.log(`[TTS] Phonemizing: "${normalized.slice(0, 50)}..."`);
  const sentences = phonemizeToCodePoints(normalized, config.espeak?.voice ?? PHONEMIZER_VOICE);
  if (!sentences || sentences.length === 0) {
    return { audio: new Float32Array(0), sampleRate: config.audio?.sample_rate ?? 22050 };
  }

  // Convert code points to characters and map to IDs
  // Matches revospeech's _phonemes_to_ids: BOS, phoneme, PAD, phoneme, PAD, ..., EOS
  const phonemeIdMap: Record<string, number[]> = config.phoneme_id_map ?? {};
  const bosIds = phonemeIdMap["^"] ?? [1];
  const eosIds = phonemeIdMap["$"] ?? [2];
  const padIds = phonemeIdMap["_"] ?? [0];

  const ids: number[] = [...bosIds];
  for (const sentence of sentences) {
    for (const cp of sentence) {
      const char = String.fromCodePoint(cp);
      const mapped = phonemeIdMap[char];
      if (mapped && mapped.length > 0) {
        ids.push(...mapped);
        ids.push(...padIds);
      }
    }
  }
  ids.push(...eosIds);
  console.log(`[TTS] Phonemes: ${ids.length} IDs from ${sentences.flat().length} code points`);

  // Build ONNX input tensors (standard piper VITS format)
  const inference = config.inference ?? {};
  const inputTensor = new ort.Tensor(
    "int64",
    new BigInt64Array(ids.map((id) => BigInt(id))),
    [1, ids.length]
  );
  const lengthTensor = new ort.Tensor(
    "int64",
    new BigInt64Array([BigInt(ids.length)]),
    [1]
  );
  const scalesTensor = new ort.Tensor(
    "float32",
    new Float32Array([
      inference.noise_scale ?? 0.667,
      options?.lengthScale ?? inference.length_scale ?? 1.0,
      inference.noise_w ?? 0.8,
    ]),
    [3]
  );

  const feeds: Record<string, any> = {
    input: inputTensor,
    input_lengths: lengthTensor,
    scales: scalesTensor,
  };

  if (inference.speaker_id !== undefined) {
    feeds.sid = new ort.Tensor(
      "int64",
      new BigInt64Array([BigInt(inference.speaker_id)]),
      [1]
    );
  }

  console.log(`[TTS] Running ONNX inference with ${ids.length} phoneme IDs...`);
  const results = await session.run(feeds);
  console.log(`[TTS] Inference done, audio length:`, results.output?.data?.length ?? "unknown");
  const audioTensor = results.output ?? results[Object.keys(results)[0]];

  return {
    audio: new Float32Array(audioTensor.data),
    sampleRate: config.audio?.sample_rate ?? 22050,
  };
}

export async function dispose(): Promise<void> {
  for (const [, loaded] of loadedSessions) {
    try {
      await loaded.session.release();
    } catch {
      // ignore
    }
  }
  loadedSessions.clear();
  ready = false;
  initPromise = null;
  speakers = [];
}
