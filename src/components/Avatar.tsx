import { useMemo } from "react";
import type { AvatarPack } from "../types";
import { useBlink } from "../hooks/useBlink";
import { getSpriteUrl } from "../services/avatar";
import styles from "./Avatar.module.css";

interface Props {
  avatar: AvatarPack;
  mouthLevel: number;
}

/** PNGTuber renderer: swaps between 4 sprites based on mouth/eye state. */
export function Avatar({ avatar, mouthLevel }: Props) {
  const isBlinking = useBlink();
  // Mouth opens only on strong voiced peaks (>=90%) and closes below, so it
  // flaps with volume/syllable changes instead of staying pinned open.
  const MOUTH_OPEN_THRESHOLD = 0.9;
  const src = useMemo(
    () => getSpriteUrl(avatar.images, mouthLevel > MOUTH_OPEN_THRESHOLD, !isBlinking),
    [avatar.images, isBlinking, mouthLevel]
  );

  return (
    <div className={styles.container}>
      <img src={src} alt="Avatar" className={styles.sprite} draggable={false} />
    </div>
  );
}
