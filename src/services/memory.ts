/**
 * Memory Service — long-term semantic memory + working-memory context.
 *
 * Long-term memory: durable facts about the user (name, job, family, likes,
 * dislikes). Persisted in localStorage across browser sessions. Injected
 * invisibly into each LLM turn so the avatar "remembers" the user.
 *
 * Working memory (topic, emotion) lives in useChat state, not here — it is
 * per-session and discarded on reset. This module only formats it into the
 * context note.
 */

import type { AvatarEmotion } from "../types";

const MEMORY_KEY = "avatar-chrome_memory";
const MAX_FACTS = 200;
const MAX_INJECT_FACTS = 8;
const MAX_CONTEXT_CHARS = 480;

export interface MemoryFact {
  id: string;
  content: string;
  createdAt: number;
}

// --- Long-term memory (persistent) ---

export function loadMemories(): MemoryFact[] {
  try {
    const raw = localStorage.getItem(MEMORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MemoryFact[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(facts: MemoryFact[]): void {
  try {
    // Keep only the most recent MAX_FACTS entries.
    const trimmed = facts.slice(-MAX_FACTS);
    localStorage.setItem(MEMORY_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.warn("[memory] failed to persist:", e);
  }
}

function normalize(content: string): string {
  return content.replace(/\s+/g, " ").trim();
}

/**
 * Add a durable fact. Returns the stored fact, or null if it was empty or a
 * case-insensitive duplicate of an existing memory.
 */
export function addMemory(content: string): MemoryFact | null {
  const fact = normalize(content);
  if (!fact) return null;
  const facts = loadMemories();
  const lower = fact.toLowerCase();
  if (facts.some((f) => f.content.toLowerCase() === lower)) return null;
  const entry: MemoryFact = {
    id: crypto.randomUUID(),
    content: fact,
    createdAt: Date.now(),
  };
  facts.push(entry);
  persist(facts);
  return entry;
}

export function clearMemories(): void {
  try {
    localStorage.removeItem(MEMORY_KEY);
  } catch {
    // ignore
  }
}

// --- Context note (injected before each user turn) ---

export interface WorkingMemory {
  topic?: string;
  emotion?: AvatarEmotion;
}

/**
 * Build the invisible context note prepended to each user turn. Combines
 * long-term memory facts with the current working topic. Malay headers so the
 * avatar persona treats them as background knowledge rather than conversation.
 */
export function buildMemoryContext(
  memories: MemoryFact[],
  working: WorkingMemory
): string {
  const lines: string[] = [];

  // Inject only the most recent facts.
  const recent = memories.slice(-MAX_INJECT_FACTS);
  if (recent.length > 0) {
    const header = "[Ingatan jangka panjang tentang pengguna]";
    const factLines = recent.map((m) => `- ${m.content}`);
    lines.push([header, ...factLines].join("\n"));
  }

  if (working.topic && working.topic.trim()) {
    lines.push(`[Topik semasa: ${working.topic.trim()}]`);
  }

  let note = lines.join("\n\n");
  if (note.length > MAX_CONTEXT_CHARS) {
    note = note.slice(0, MAX_CONTEXT_CHARS - 1) + "…";
  }
  return note;
}
