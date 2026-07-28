/**
 * TTS Service — facade for the local Piper TTS server.
 *
 * The app calls isReady / initialize / speak / stop / getSpeakers.
 * Audio playback and lip-sync are shared in playback.ts.
 */

import * as tts from "./piper";
import * as playback from "./playback";

export { tts };

export function isReady(): boolean {
  return tts.isReady();
}

export function getSpeakers() {
  return tts.getSpeakers();
}

export async function initialize(
  onProgress?: (msg: string | null) => void,
  preferredSpeaker?: string
): Promise<void> {
  return tts.initialize(onProgress, preferredSpeaker);
}

export async function synthesize(
  text: string,
  options?: { speaker?: string; lengthScale?: number }
): Promise<{ audio: Float32Array; sampleRate: number }> {
  return tts.synthesize(text, options);
}

export async function speak(
  text: string,
  onMouthChange: (level: number) => void,
  options?: { speaker?: string; lengthScale?: number }
): Promise<void> {
  stop();
  onMouthChange(0);

  if (!isReady()) {
    await initialize((msg) => msg && console.log("TTS:", msg));
  }

  const { audio, sampleRate } = await synthesize(text, options);
  await playback.play(audio, sampleRate, onMouthChange);
}

export function stop(): void {
  playback.stop();
}

export async function dispose(): Promise<void> {
  stop();
  await tts.dispose();
  await playback.dispose();
}
