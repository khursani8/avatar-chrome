import type { AvatarEmotion, AvatarState } from "../types";
import { BASE_SYSTEM_PROMPT } from "../types";

/**
 * LLM Service — Chrome Built-in AI (Prompt API / LanguageModel)
 *
 * Uses the on-device Gemini Nano model that Chrome ships. No server, no API key.
 * Requires Chrome 138+ with the following flags enabled:
 *   - chrome://flags/#optimization-guide-on-device-model
 *   - chrome://flags/#prompt-api-for-gemini-nano
 */

// Prompt API type declarations.
declare global {
  interface Window {
    LanguageModel?: LanguageModelAPI;
  }
  var LanguageModel: LanguageModelAPI | undefined;
}

interface LanguageModelAPI {
  availability(options?: ModelOptions): Promise<string>;
  create(options?: CreateOptions): Promise<LanguageModelSession>;
}

interface ModelOptions {
  expectedInputs?: Array<{ type: string; languages: string[] }>;
  expectedOutputs?: Array<{ type: string; languages: string[] }>;
}

interface CreateOptions extends ModelOptions {
  initialPrompts?: LanguageModelMessage[];
  monitor?: (m: DownloadMonitor) => void;
}

interface LanguageModelMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface DownloadMonitor {
  addEventListener(
    event: "downloadprogress",
    handler: (e: { loaded: number }) => void
  ): void;
}

interface LanguageModelSession {
  prompt(text: string): Promise<string>;
  destroy(): void;
}

export type LLMStatus =
  | "checking"
  | "available"
  | "downloading"
  | "unavailable"
  | "error";

const MODEL_IO = Object.freeze({
  expectedInputs: [{ type: "text", languages: ["en"] }],
  expectedOutputs: [{ type: "text", languages: ["en"] }],
});

let session: LanguageModelSession | null = null;
let sessionCreation: Promise<void> | null = null;
let sessionCreationKey: string | null = null;
let sessionCreationGeneration = -1;
let sessionGeneration = 0;

export type UnavailableReason = "api-missing" | "model-unavailable";

let unavailableReason: UnavailableReason | null = null;

/** Why the model is unavailable (null when available or not yet checked). */
export function getUnavailableReason(): UnavailableReason | null {
  return unavailableReason;
}

export function isAvailable(): boolean {
  return typeof LanguageModel !== "undefined";
}

export async function checkAvailability(): Promise<LLMStatus> {
  if (!isAvailable()) {
    unavailableReason = "api-missing";
    return "unavailable";
  }
  try {
    const status = await LanguageModel!.availability(MODEL_IO);
    // Accept both legacy ("available"/"downloadable") and current
    // ("readily"/"after-download") availability string names.
    if (status === "available" || status === "readily") {
      unavailableReason = null;
      return "available";
    }
    if (
      status === "downloadable" ||
      status === "after-download" ||
      status === "downloading"
    ) {
      unavailableReason = null;
      return "downloading";
    }
    unavailableReason = "model-unavailable";
    return "unavailable";
  } catch {
    return "error";
  }
}

export async function createSession(
  systemPrompt: string,
  contextHistory: Array<{
    role: "user" | "assistant";
    content: string;
  }> = [],
  onDownloadProgress?: (pct: number) => void
): Promise<void> {
  const recentHistory = contextHistory.slice(-20);
  const creationKey = JSON.stringify([systemPrompt, recentHistory]);

  if (sessionCreation) {
    const pendingCreation = sessionCreation;
    if (
      sessionCreationKey === creationKey &&
      sessionCreationGeneration === sessionGeneration
    ) {
      return pendingCreation;
    }

    try {
      await pendingCreation;
    } catch {
      // A newer request should still get a chance to create its own session.
    }
    return createSession(systemPrompt, contextHistory, onDownloadProgress);
  }

  const creationGeneration = sessionGeneration;
  const create = async () => {
    const initialPrompts: LanguageModelMessage[] = [
      // Hardcoded JSON contract (BASE) is hidden from the user; the editable
      // persona (systemPrompt) is appended so editing Settings can't break it.
      { role: "system", content: `${BASE_SYSTEM_PROMPT}\n\n${systemPrompt}` },
      ...recentHistory,
    ];
    const options: CreateOptions = { ...MODEL_IO, initialPrompts };
    if (onDownloadProgress) {
      options.monitor = (m) => {
        m.addEventListener("downloadprogress", (e) => {
          onDownloadProgress(Math.round((e.loaded || 0) * 100));
        });
      };
    }

    const nextSession = await LanguageModel!.create(options);
    if (creationGeneration !== sessionGeneration) {
      try {
        nextSession.destroy();
      } catch {
        // The stale session is already unusable.
      }
      return;
    }

    const previousSession = session;
    session = nextSession;
    if (previousSession) {
      try {
        previousSession.destroy();
      } catch {
        // The replacement session is already active.
      }
    }
  };

  const pendingCreation = create();
  sessionCreation = pendingCreation;
  sessionCreationKey = creationKey;
  sessionCreationGeneration = creationGeneration;

  try {
    await pendingCreation;
  } finally {
    if (sessionCreation === pendingCreation) {
      sessionCreation = null;
      sessionCreationKey = null;
      sessionCreationGeneration = -1;
    }
  }
}

export async function prompt(text: string): Promise<string> {
  if (!session) throw new Error("LLM session not created");
  return session.prompt(text);
}

const EMOTIONS: ReadonlySet<AvatarEmotion> = new Set([
  "neutral",
  "gembira",
  "sedih",
  "teruja",
  "marah",
  "bingung",
]);

/**
 * Parse model output into a validated AvatarState. Tolerant of leading/trailing
 * prose and markdown fences — extracts the outermost JSON object. If parsing
 * fails, falls back to treating the whole output as the spoken reply so TTS
 * still works.
 */
function parseState(raw: string): AvatarState {
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const obj = JSON.parse(match[0]) as Partial<AvatarState>;
      if (typeof obj.reply === "string" && obj.reply.trim()) {
        const emotionRaw = typeof obj.emotion === "string" ? obj.emotion : "";
        const emotion: AvatarEmotion = EMOTIONS.has(emotionRaw as AvatarEmotion)
          ? (emotionRaw as AvatarEmotion)
          : "neutral";
        const topic =
          typeof obj.topic === "string" && obj.topic.trim()
            ? obj.topic.trim()
            : undefined;
        const remember = Array.isArray(obj.remember)
          ? obj.remember
              .filter((r): r is string => typeof r === "string" && r.trim().length > 0)
              .map((r) => r.trim())
          : undefined;
        return { reply: obj.reply.trim(), topic, emotion, remember };
      }
    } catch {
      // Malformed JSON — fall through to raw fallback.
    }
  }
  return { reply: raw };
}

/**
 * Prompt the session and parse the JSON state reply. `contextNote` is an
 * invisible block (long-term memory + current topic) prepended to the user
 * turn so the avatar has background context. It is never shown in the UI.
 */
export async function promptForState(
  text: string,
  contextNote?: string
): Promise<AvatarState> {
  if (!session) throw new Error("LLM session not created");
  const fullText =
    contextNote && contextNote.trim()
      ? `${contextNote.trim()}\n\n${text}`
      : text;
  const raw = await session.prompt(fullText);
  return parseState(raw);
}

export function destroySession(): void {
  sessionGeneration += 1;
  if (session) {
    try {
      session.destroy();
    } catch {
      // ignore
    }
    session = null;
  }
}

export function hasSession(): boolean {
  return session !== null;
}
