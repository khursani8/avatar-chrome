/**
 * Avatar Service — PNGTuber avatar registration and lookup.
 *
 * Built-in avatars load from public/avatars/. Custom avatars are stored as
 * Blob records in IndexedDB and surfaced as object URLs.
 */

import type { AvatarImages, AvatarPack } from "../types";
import {
  blobImagesToUrls,
  deleteAvatarPack,
  deleteAvatarViewTransform,
  listAvatarPacks,
  loadAvatarPack,
  saveAvatarPack,
  type StoredAvatarPack,
} from "./storage";

const BASE_URL = import.meta.env.BASE_URL;

/** The default avatar bundled in public/avatars/default/. */
const DEFAULT_AVATAR: AvatarPack = {
  id: "default",
  name: "Female",
  isBuiltIn: true,
  thumbnailUrl: `${BASE_URL}avatars/default/mouth_close_eyes_open.png`,
  images: {
    mouthCloseEyesOpen: `${BASE_URL}avatars/default/mouth_close_eyes_open.png`,
    mouthCloseEyesClose: `${BASE_URL}avatars/default/mouth_close_eyes_close.png`,
    mouthOpenEyesOpen: `${BASE_URL}avatars/default/mouth_open_eyes_open.png`,
    mouthOpenEyesClose: `${BASE_URL}avatars/default/mouth_open_eyes_close.png`,
  },
};

const MALE_AVATAR: AvatarPack = {
  id: "male",
  name: "Male",
  isBuiltIn: true,
  thumbnailUrl: `${BASE_URL}avatars/male/mouth_close_eyes_open.png`,
  images: {
    mouthCloseEyesOpen: `${BASE_URL}avatars/male/mouth_close_eyes_open.png`,
    mouthCloseEyesClose: `${BASE_URL}avatars/male/mouth_close_eyes_close.png`,
    mouthOpenEyesOpen: `${BASE_URL}avatars/male/mouth_open_eyes_open.png`,
    mouthOpenEyesClose: `${BASE_URL}avatars/male/mouth_open_eyes_close.png`,
  },
};

const BUILT_IN_AVATARS: AvatarPack[] = [DEFAULT_AVATAR, MALE_AVATAR];
const BUILT_IN_IDS = new Set(BUILT_IN_AVATARS.map((a) => a.id));

export function getDefaultAvatar(): AvatarPack {
  return DEFAULT_AVATAR;
}

export async function getAllAvatars(): Promise<AvatarPack[]> {
  const stored = await listAvatarPacks();
  const custom = stored
    .map(storedToAvatarPack)
    .filter((a): a is AvatarPack => a !== undefined);
  return [...BUILT_IN_AVATARS, ...custom];
}

export async function getAvatarById(
  id: string
): Promise<AvatarPack | undefined> {
  const builtIn = BUILT_IN_AVATARS.find((a) => a.id === id);
  if (builtIn) return builtIn;
  const stored = await loadAvatarPack(id);
  return stored ? storedToAvatarPack(stored) : undefined;
}

export async function registerAvatar(
  name: string,
  files: {
    mouthCloseEyesOpen: File;
    mouthCloseEyesClose: File;
    mouthOpenEyesOpen: File;
    mouthOpenEyesClose: File;
  }
): Promise<AvatarPack> {
  const stored: StoredAvatarPack = {
    id: `custom_png_${Date.now()}`,
    name,
    images: files,
  };
  await saveAvatarPack(stored);
  return storedToAvatarPack(stored)!;
}

export async function removeAvatar(id: string): Promise<void> {
  if (BUILT_IN_IDS.has(id)) return;
  await deleteAvatarPack(id);
  deleteAvatarViewTransform(id);
}

function storedToAvatarPack(stored: StoredAvatarPack): AvatarPack | undefined {
  const { images, dispose } = blobImagesToUrls(stored.images);
  return {
    id: stored.id,
    name: stored.name,
    isBuiltIn: false,
    images,
    thumbnailUrl: images.mouthCloseEyesOpen,
    dispose,
  };
}

/** Pick the correct sprite for the current mouth/eye state. */
export function getSpriteUrl(
  images: AvatarImages,
  mouthOpen: boolean,
  eyesOpen: boolean
): string {
  if (mouthOpen && eyesOpen) return images.mouthOpenEyesOpen;
  if (mouthOpen && !eyesOpen) return images.mouthOpenEyesClose;
  if (!mouthOpen && eyesOpen) return images.mouthCloseEyesOpen;
  return images.mouthCloseEyesClose;
}
