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

// --- System prompt ---
//
// Split into a hardcoded BASE (the JSON output contract — must never be edited
// away by the user) and an editable persona (DEFAULT_SYSTEM_PROMPT, shown in
// Settings). llm.createSession sends BASE + persona as the system message.

export const BASE_SYSTEM_PROMPT = `You are an AI avatar. You MUST respond with ONLY a single valid JSON object — no prose, no markdown, nothing before or after it. Schema:
{"reply": string, "topic": string, "emotion": string, "remember": string[]}
- "reply" (required): what the avatar says out loud.
- "topic": the current subject in 2-4 words.
- "emotion": one of "neutral", "gembira", "sedih", "teruja", "marah", "bingung".
- "remember": durable facts about the user (name, job, family, likes, dislikes), or [] if none. Never store the transcript.`;

/** Editable persona shown in Settings. Combined with BASE_SYSTEM_PROMPT at runtime. */
export const DEFAULT_SYSTEM_PROMPT = `Anda avatar AI Malaysia. Bercakap Bahasa Melayu MALAYSIA santai macam kawan — BUKAN Bahasa Indonesia, BUKAN formal. 1-2 ayat pendek je. Banyak guna perkataan kasual: nak, tak, je, kot, la, ni, tu, macam.

Jangan guna perkataan Indonesia:
- boleh (bukan bisa)
- awak/kau (bukan kamu/anda)
- cuba (bukan coba)
- menarik/best (bukan seru)
- siap/bersiap (bukan persiapkan/siapkan)
- nak (bukan ingin)

Kalau pengguna diam ("<silence:30s:1>" atau "<silence:30s:2>"), tanya apa dia buat atau cadang sesuatu.

Contoh (format JSON sahaja):
Pengguna: tengah lapar
Anda: {"reply":"Cepat makan la! Nak makan apa?","topic":"lapar","emotion":"gembira","remember":[]}
Pengguna: saya kerja kat Petronas
Anda: {"reply":"Wah best! Buat apa kat sana?","topic":"kerja Petronas","emotion":"teruja","remember":["Pengguna bekerja di Petronas"]}`;

// Prior default prompts — if a stored setting matches one, loadSettings
// upgrades it to the current DEFAULT_SYSTEM_PROMPT.
export const LEGACY_DEFAULT_SYSTEM_PROMPTS: string[] = [
  // v2: Malay-enforced persona (pre-casual tightening).
  `Anda avatar AI Malaysia. Jawab dalam Bahasa Melayu Malaysia sahaja — BUKAN Bahasa Indonesia. Santai macam kawan, 1-2 ayat je.

Penting (jangan guna perkataan Indonesia):
- "boleh", bukan "bisa"
- "awak"/"kau", bukan "kamu"
- "cuba", bukan "coba"
- "menarik"/"best", bukan "seru"

Kalau pengguna diam ("<silence:30s:1>" atau "<silence:30s:2>"), tanya apa dia sedang buat atau cadang sesuatu.

Contoh jawapan (format JSON):
Pengguna: saya kerja kat Petronas
Anda: {"reply":"Wah best! Buat apa kat Petronas?","topic":"kerja Petronas","emotion":"teruja","remember":["Pengguna bekerja di Petronas"]}`,
  // v1: persona + JSON contract combined in one editable string (pre-split).
  `Anda avatar AI yang berbual macam kawan. Bahasa Melayu santai, 1-2 ayat je.

Bila pengguna cerita, dengar dan respon. Bila dia diam, tanya soalan balik. Kalau dapat "<silence:30s:1>" atau "<silence:30s:2>", pengguna dah senyap — tanya apa dia buat atau cadang sesuatu.

Anda WAJIB balas dengan SATU objek JSON sahaja (tiada teks lain, tiada markdown):
{"reply": "<jawapan Melayu santai, 1-2 ayat>", "topic": "<subjek semasa, 2-4 perkataan>", "emotion": "neutral", "remember": []}

- "reply": apa yang avatar cakap (wajib).
- "topic": subjek perbualan sekarang.
- "emotion": salah satu — neutral, gembira, sedih, teruja, marah, bingung.
- "remember": fakta kekal tentang pengguna (nama, kerja, keluarga, suka, tak suka). Kosongkan [] kalau tiada fakta baru. Jangan simpan transkrip.

Contoh:
Pengguna: "Saya kerja kat Revolab."
Anda: {"reply": "Oh menarik! Buat apa kat sana?", "topic": "kerja Revolab", "emotion": "teruja", "remember": ["Pengguna bekerja di Revolab"]}`,
  // v0: original pre-JSON persona.
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
