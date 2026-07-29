/**
 * Audio Playback — shared playback layer for Float32Array PCM audio.
 *
 * Engine-agnostic: takes raw float samples + sample rate, plays them, and
 * derives a continuous mouth-opening level from amplitude via AnalyserNode.
 */

let audioCtx: AudioContext | null = null;
let sourceNode: AudioBufferSourceNode | null = null;
let analyserNode: AnalyserNode | null = null;
let animFrameId: number | null = null;

const RMS_CEILING = 0.12;

/** Shared AudioContext (default rate; AudioBuffers carry their own sampleRate). */
function getAudioContext(): AudioContext {
  if (!audioCtx || audioCtx.state === "closed") {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

/**
 * Unlock Web Audio on a user gesture. Chrome blocks AudioContext until it is
 * created/resumed inside a gesture; call this from a pointerdown/keydown so
 * later TTS playback (which runs in an async chain, not a gesture) is allowed.
 */
export function unlockAudio(): void {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") void ctx.resume();
}

export async function play(
  audio: Float32Array,
  sampleRate: number,
  onMouthChange: (level: number) => void
): Promise<void> {
  stop();

  // Use the shared context (created/resumed on the first gesture by unlockAudio).
  // AudioBuffers carry their own sampleRate, so the default-rate context
  // resamples correctly — no need to recreate the context per sample rate.
  const ctx = getAudioContext();
  if (ctx.state === "suspended") {
    await ctx.resume();
  }

  const buffer = ctx.createBuffer(1, audio.length, sampleRate);
  buffer.getChannelData(0).set(audio);

  analyserNode = ctx.createAnalyser();
  analyserNode.fftSize = 256;

  const playbackSource = ctx.createBufferSource();
  sourceNode = playbackSource;
  playbackSource.buffer = buffer;
  playbackSource.connect(analyserNode);
  analyserNode.connect(ctx.destination);

  await new Promise<void>((resolve) => {
    playbackSource.onended = () => {
      if (sourceNode === playbackSource) {
        stopMouthAnimation();
        onMouthChange(0);
        sourceNode = null;
      }
      resolve();
    };

    playbackSource.start();
    startMouthAnimation(onMouthChange);
  });
}

export function stop(): void {
  if (sourceNode) {
    try {
      sourceNode.stop();
    } catch {
      // already stopped
    }
    sourceNode = null;
  }
  stopMouthAnimation();
}

export async function dispose(): Promise<void> {
  stop();
  if (audioCtx && audioCtx.state !== "closed") {
    try {
      await audioCtx.close();
    } catch {
      // ignore
    }
  }
  audioCtx = null;
  analyserNode = null;
}

function startMouthAnimation(onMouthChange: (level: number) => void): void {
  if (!analyserNode) return;
  const data = new Uint8Array(analyserNode.frequencyBinCount);
  let smoothedLevel = 0;

  function tick() {
    analyserNode!.getByteTimeDomainData(data);
    let squareSum = 0;
    for (let i = 0; i < data.length; i++) {
      const sample = (data[i] - 128) / 128;
      squareSum += sample * sample;
    }
    const rms = Math.sqrt(squareSum / data.length);
    const targetLevel = Math.min(1, rms / RMS_CEILING);
    const smoothing = targetLevel > smoothedLevel ? 0.48 : 0.24;
    smoothedLevel += (targetLevel - smoothedLevel) * smoothing;
    onMouthChange(smoothedLevel);
    animFrameId = requestAnimationFrame(tick);
  }
  animFrameId = requestAnimationFrame(tick);
}

function stopMouthAnimation(): void {
  if (animFrameId !== null) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
}
