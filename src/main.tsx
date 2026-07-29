import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { ORT_CDN_BASE } from "./services/tts/piper";
import { unlockAudio } from "./services/tts/playback";

/**
 * Preload ONNX Runtime Web from public/tts/dist/ if available.
 * Loaded via <script> tag to avoid Vite WASM bundling issues.
 * Non-fatal — the app loads regardless; TTS just shows an error.
 */
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${src}"]`
    );
    if (existing) {
      if (existing.dataset.loaded === "true") return resolve();
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error(`Failed to load ${src}`)),
        { once: true }
      );
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.addEventListener(
      "load",
      () => {
        script.dataset.loaded = "true";
        resolve();
      },
      { once: true }
    );
    script.addEventListener(
      "error",
      () => reject(new Error(`Failed to load ${src}`)),
      { once: true }
    );
    document.head.appendChild(script);
  });
}

async function bootstrap() {
  try {
    // ONNX Runtime Web loaded from a pinned CDN to avoid bundling the
    // ~129MB runtime / >25MB wasm files into the static deploy.
    await loadScript(`${ORT_CDN_BASE}ort.min.js`);
  } catch (error) {
    console.warn("ONNX Runtime not preloaded:", error);
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );

  // Register the offline service worker (production only — dev stays uncached
  // so HMR isn't masked by stale cached assets).
  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .catch((e) => console.warn("[sw] registration failed:", e));
  }

  // Unlock Web Audio on the first user gesture so TTS playback (which runs in
  // an async chain after the LLM reply) isn't blocked by Chrome's autoplay policy.
  const unlock = () => unlockAudio();
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
}

void bootstrap();
