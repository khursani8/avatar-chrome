/**
 * Type definitions and app constants.
 */

// --- Chat ---

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

/** Avatar → speaker binding: female avatar = sarah voice, male = paan voice. */
export const SPEAKER_FOR_AVATAR: Record<string, string> = {
  default: "sarah",
  male: "paan",
};

// --- App mode ---

export type AppMode = "chat" | "broadcast";

// --- Avatar (PNGTuber only) ---

export interface AvatarImages {
  mouthCloseEyesOpen: string;
  mouthCloseEyesClose: string;
  mouthOpenEyesOpen: string;
  mouthOpenEyesClose: string;
}

export interface AvatarPack {
  id: string;
  name: string;
  isBuiltIn: boolean;
  thumbnailUrl?: string;
  images: AvatarImages;
  dispose?: () => void;
}

export interface AvatarViewTransform {
  x: number;
  y: number;
  scale: number;
}

// --- Avatar LLM state (JSON contract) ---

export type AvatarEmotion =
  | "neutral"
  | "gembira"
  | "sedih"
  | "teruja"
  | "marah"
  | "bingung";

/** Structured per-turn output the LLM must return (parsed by services/llm). */
export interface AvatarState {
  /** Malay text the avatar speaks — sent to TTS. Always present. */
  reply: string;
  /** Current conversation subject (working memory, ephemeral). */
  topic?: string;
  /** Avatar's current emotion (working memory, ephemeral). */
  emotion?: AvatarEmotion;
  /** Durable semantic facts about the user (long-term memory deltas). */
  remember?: string[];
}

// --- Default system prompt ---

export const DEFAULT_SYSTEM_PROMPT = `Anda avatar AI yang berbual macam kawan. Bahasa Melayu santai, 1-2 ayat je.

Bila pengguna cerita, dengar dan respon. Bila dia diam, tanya soalan balik. Kalau dapat "<silence:30s:1>" atau "<silence:30s:2>", pengguna dah senyap — tanya apa dia buat atau cadang sesuatu.

Anda WAJIB balas dengan SATU objek JSON sahaja (tiada teks lain, tiada markdown):
{"reply": "<jawapan Melayu santai, 1-2 ayat>", "topic": "<subjek semasa, 2-4 perkataan>", "emotion": "neutral", "remember": []}

- "reply": apa yang avatar cakap (wajib).
- "topic": subjek perbualan sekarang.
- "emotion": salah satu — neutral, gembira, sedih, teruja, marah, bingung.
- "remember": fakta kekal tentang pengguna (nama, kerja, keluarga, suka, tak suka). Kosongkan [] kalau tiada fakta baru. Jangan simpan transkrip.

Contoh:
Pengguna: "Saya kerja kat Revolab."
Anda: {"reply": "Oh menarik! Buat apa kat sana?", "topic": "kerja Revolab", "emotion": "teruja", "remember": ["Pengguna bekerja di Revolab"]}`;

// Prior default prompts — if a stored setting matches one, loadSettings
// upgrades it to the current DEFAULT_SYSTEM_PROMPT.
export const LEGACY_DEFAULT_SYSTEM_PROMPTS: string[] = [
  `Anda avatar AI yang berbual macam kawan. Bahasa Melayu santai, 1-2 ayat je.

Bila pengguna cerita, dengar dan respon. Bila dia diam, tanya soalan balik. Kalau dapat "<silence:30s:1>" atau "<silence:30s:2>", pengguna dah senyap — tanya apa dia buat atau cadang sesuatu.`,
];

export function isDefaultSystemPrompt(value: string): boolean {
  return value === DEFAULT_SYSTEM_PROMPT;
}

// --- Settings ---

export interface AppSettings {
  appMode: AppMode;
  ttsEnabled: boolean;
  selectedAvatarId: string;
  backgroundImageEnabled: boolean;
  backgroundImageUpdatedAt: number;
  llmSystemPrompt: string;
  ttsLengthScale: number;
  ttsSpeaker: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  appMode: "chat",
  ttsEnabled: true,
  selectedAvatarId: "default",
  backgroundImageEnabled: false,
  backgroundImageUpdatedAt: 0,
  llmSystemPrompt: DEFAULT_SYSTEM_PROMPT,
  ttsLengthScale: 1.0,
  ttsSpeaker: "",
};
