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
  const src = useMemo(
    () => getSpriteUrl(avatar.images, mouthLevel > 0.18, !isBlinking),
    [avatar.images, isBlinking, mouthLevel]
  );

  return (
    <div className={styles.container}>
      <img src={src} alt="Avatar" className={styles.sprite} draggable={false} />
    </div>
  );
}
