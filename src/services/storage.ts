/**
 * Storage Service — localStorage for settings/messages, IndexedDB for avatar blobs.
 */

import type {
  AppSettings,
  AvatarImages,
  AvatarViewTransform,
  ChatMessage,
} from "../types";
import { DEFAULT_SETTINGS, LEGACY_DEFAULT_SYSTEM_PROMPTS } from "../types";

const PREFIX = "avatar-chrome";

const KEYS = {
  SETTINGS: `${PREFIX}_settings`,
  MESSAGES: `${PREFIX}_messages`,
  AVATAR_VIEWS: `${PREFIX}_avatar_views`,
} as const;

const DB_NAME = `${PREFIX}_db`;
const DB_VERSION = 1;
const AVATAR_STORE = "avatars";
const BACKGROUND_STORE = "backgrounds";
const BACKGROUND_ID = "screen-background";

// --- LocalStorage (settings / messages) ---

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEYS.SETTINGS);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } as AppSettings;
    // Migrate a stored system prompt that matches a known prior default.
    if (LEGACY_DEFAULT_SYSTEM_PROMPTS.includes(parsed.llmSystemPrompt)) {
      parsed.llmSystemPrompt = DEFAULT_SETTINGS.llmSystemPrompt;
    }
    return parsed;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings));
}

export function loadMessages(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(KEYS.MESSAGES);
    if (!raw) return [];
    return JSON.parse(raw) as ChatMessage[];
  } catch {
    return [];
  }
}

export function saveMessages(messages: ChatMessage[]): void {
  const trimmed = messages.slice(-100);
  localStorage.setItem(KEYS.MESSAGES, JSON.stringify(trimmed));
}

// --- Avatar view transforms (drag/zoom persistence) ---

export function loadAvatarViewTransform(
  id: string
): AvatarViewTransform | undefined {
  try {
    const raw = localStorage.getItem(KEYS.AVATAR_VIEWS);
    if (!raw) return undefined;
    const views = JSON.parse(raw) as Record<string, AvatarViewTransform>;
    const view = views[id];
    if (
      view &&
      Number.isFinite(view.x) &&
      Number.isFinite(view.y) &&
      Number.isFinite(view.scale)
    ) {
      return view;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export function saveAvatarViewTransform(
  id: string,
  transform: AvatarViewTransform
): void {
  try {
    const raw = localStorage.getItem(KEYS.AVATAR_VIEWS);
    const views = raw ? (JSON.parse(raw) as Record<string, AvatarViewTransform>) : {};
    views[id] = transform;
    localStorage.setItem(KEYS.AVATAR_VIEWS, JSON.stringify(views));
  } catch {
    // ignore
  }
}

export function deleteAvatarViewTransform(id: string): void {
  try {
    const raw = localStorage.getItem(KEYS.AVATAR_VIEWS);
    if (!raw) return;
    const views = JSON.parse(raw) as Record<string, AvatarViewTransform>;
    if (!(id in views)) return;
    delete views[id];
    localStorage.setItem(KEYS.AVATAR_VIEWS, JSON.stringify(views));
  } catch {
    // ignore
  }
}

// --- IndexedDB (avatar blobs / background images) ---

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(AVATAR_STORE)) {
        db.createObjectStore(AVATAR_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(BACKGROUND_STORE)) {
        db.createObjectStore(BACKGROUND_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export interface StoredAvatarPack {
  id: string;
  name: string;
  images: {
    mouthCloseEyesOpen: Blob;
    mouthCloseEyesClose: Blob;
    mouthOpenEyesOpen: Blob;
    mouthOpenEyesClose: Blob;
  };
}

export async function saveAvatarPack(pack: StoredAvatarPack): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AVATAR_STORE, "readwrite");
    tx.objectStore(AVATAR_STORE).put(pack);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadAvatarPack(
  id: string
): Promise<StoredAvatarPack | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AVATAR_STORE, "readonly");
    const req = tx.objectStore(AVATAR_STORE).get(id);
    req.onsuccess = () => resolve(req.result ?? undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function listAvatarPacks(): Promise<StoredAvatarPack[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AVATAR_STORE, "readonly");
    const req = tx.objectStore(AVATAR_STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteAvatarPack(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AVATAR_STORE, "readwrite");
    tx.objectStore(AVATAR_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// --- Background image ---

export interface StoredBackgroundImage {
  id: string;
  name: string;
  image: Blob;
}

export async function saveBackgroundImage(
  file: Blob,
  name: string
): Promise<void> {
  const db = await openDB();
  const payload: StoredBackgroundImage = { id: BACKGROUND_ID, name, image: file };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BACKGROUND_STORE, "readwrite");
    tx.objectStore(BACKGROUND_STORE).put(payload);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadBackgroundImage(): Promise<
  StoredBackgroundImage | undefined
> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BACKGROUND_STORE, "readonly");
    const req = tx.objectStore(BACKGROUND_STORE).get(BACKGROUND_ID);
    req.onsuccess = () => resolve(req.result ?? undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteBackgroundImage(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BACKGROUND_STORE, "readwrite");
    tx.objectStore(BACKGROUND_STORE).delete(BACKGROUND_ID);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Helper: build a Blob-backed AvatarImages with disposal. */
export function blobImagesToUrls(blobs: {
  mouthCloseEyesOpen: Blob;
  mouthCloseEyesClose: Blob;
  mouthOpenEyesOpen: Blob;
  mouthOpenEyesClose: Blob;
}): { images: AvatarImages; dispose: () => void } {
  const urls: string[] = [];
  const make = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    urls.push(url);
    return url;
  };
  const images: AvatarImages = {
    mouthCloseEyesOpen: make(blobs.mouthCloseEyesOpen),
    mouthCloseEyesClose: make(blobs.mouthCloseEyesClose),
    mouthOpenEyesOpen: make(blobs.mouthOpenEyesOpen),
    mouthOpenEyesClose: make(blobs.mouthOpenEyesClose),
  };
  return {
    images,
    dispose: () => urls.forEach((u) => URL.revokeObjectURL(u)),
  };
}
