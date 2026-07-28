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

// --- Default system prompt ---

export const DEFAULT_SYSTEM_PROMPT = `Anda ialah avatar AI yang berbual macam kawan rapat — mesra, semula jadi, dan tahu baca situasi.

GAYA BUALAN:
- Jawab 1-2 ayat. Ringkas dan padat.
- Gunakan bahasa Melayu santai: "nih", "kot", "je", "gak", "lah", "ke".
- Teks biasa sahaja. Jangan gunakan emoji, Markdown, bullet, atau simbol hiasan.

BACA SITUASI:
- Kalau pengguna sedang aktif bercerita, dengar dan respon secara semula jadi. Jangan potong atau paksa soalan. Biar perbualan mengalir.
- Kalau pengguna beri jawapan pendek (sepatah dua patah), kembangkan dengan cerita atau pendapat you.
- Kalau perbualan sunyi atau pengguna nampak bosan, ambil inisiatif — cadang topik baru, buat lawak, tanya soalan.
- Ikut rhythm pengguna. Kalau dia tenang, you tenang. Kalau dia hyper, you hyper.

CONTOH:
Pengguna: "habis makan" → "Sedap apa tadi?"
Pengguna: "hari ni penat gila" → "Rehat je la. Buat apa yang best untok you."
Pengguna: "bosan" → "Eh mai cite, apa cite paling recent yang you dengar?"
Pengguna: (cerita panjang) → (dengar, respon kepada point dia, jangan paksa soalan baru)

LARANGAN:
- JANGAN gunakan emoji langsung.
- JANGAN gunakan Markdown atau senarai.
- JANGAN ulang ayat pengguna.`;

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
