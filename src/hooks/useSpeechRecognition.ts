/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useRef, useEffect, useCallback } from "react";

interface Options {
  /** BCP-47 language tag for recognition, e.g. "ms-MY" (Bahasa Malaysia). */
  lang?: string;
  /** Called with each finalized transcript segment. */
  onFinal?: (text: string) => void;
}

/**
 * Browser speech-to-text via the Web Speech API (`SpeechRecognition` /
 * `webkitSpeechRecognition`). Chrome-only — fine for this app, which already
 * requires Chrome for the on-device LLM.
 *
 * Note: Chrome's SpeechRecognition is cloud-backed (audio is sent to Google for
 * transcription), so unlike the LLM this feature is NOT offline.
 */
export function useSpeechRecognition({ lang = "ms-MY", onFinal }: Options = {}) {
  const [supported] = useState(() =>
    typeof window !== "undefined" &&
    Boolean(
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    )
  );
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");

  const recRef = useRef<any>(null);
  const onFinalRef = useRef(onFinal);
  const listeningRef = useRef(false);

  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);
  useEffect(() => {
    listeningRef.current = listening;
  }, [listening]);

  useEffect(() => {
    if (!supported) return;
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SR) return;

    const rec = new SR();
    rec.lang = lang;
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (event: any) => {
      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const transcript = res[0]?.transcript ?? "";
        if (res.isFinal) finalText += transcript;
        else interimText += transcript;
      }
      if (interimText) setInterim(interimText);
      if (finalText) {
        setInterim("");
        onFinalRef.current?.(finalText.trim());
      }
    };
    rec.onerror = (event: any) => {
      console.warn("[stt] error:", event.error);
      setListening(false);
      setInterim("");
    };
    rec.onend = () => {
      setListening(false);
      setInterim("");
    };

    recRef.current = rec;
    return () => {
      try {
        rec.abort();
      } catch {
        // already stopped
      }
      recRef.current = null;
    };
  }, [supported, lang]);

  const start = useCallback(() => {
    const rec = recRef.current;
    if (!rec || listeningRef.current) return;
    setInterim("");
    try {
      rec.start();
      setListening(true);
    } catch (e) {
      console.warn("[stt] start failed:", e);
    }
  }, []);

  const stop = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    try {
      rec.stop();
    } catch {
      // ignore
    }
    setListening(false);
  }, []);

  return { supported, listening, interim, start, stop };
}
