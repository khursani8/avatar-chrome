/**
 * useChat — orchestrates LLM + TTS lifecycle for the chat experience.
 *
 * Responsibilities:
 *   - Check Chrome Built-in AI availability and create/destroy sessions
 *   - Send messages, persist history
 *   - Drive TTS playback + mouth animation on AI replies
 *   - Track status for UI feedback (preparing, sending, errors)
 */

import { useState, useCallback, useRef, useEffect } from "react";
import type { AppSettings, ChatMessage } from "../types";
import { SPEAKER_FOR_AVATAR } from "../types";
import * as llm from "../services/llm";
import * as tts from "../services/tts";
import { loadMessages, saveMessages } from "../services/storage";

export type LLMStatus =
  | "checking"
  | "available"
  | "downloading"
  | "unavailable"
  | "error";

const SYSTEM_PROMPT_UPDATE_DELAY_MS = 500;

function getContextHistory(messages: ChatMessage[]) {
  return messages.map((m) => ({ role: m.role, content: m.content }));
}

/** Convert UI speed multiplier (faster = larger) to piper lengthScale (larger = slower). */
function toTtsLengthScale(speedMultiplier: number): number {
  return speedMultiplier > 0 ? 1 / speedMultiplier : 1;
}

export function useChat(settings: AppSettings) {
  // Lazy-initialize from localStorage so we don't need setState-in-effect for messages.
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadMessages());
  const [isSending, setIsSending] = useState(false);
  const [llmStatus, setLlmStatus] = useState<LLMStatus>("checking");
  const [statusText, setStatusText] = useState("Checking AI availability...");
  const [mouthLevel, setMouthLevel] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [needsInitialization, setNeedsInitialization] = useState(false);
  const [isInitializingAI, setIsInitializingAI] = useState(false);
  const [isSessionInitializing, setIsSessionInitializing] = useState(true);
  const [ttsReady, setTtsReady] = useState(false);
  const [ttsStatus, setTtsStatus] = useState("");

  const appliedSystemPromptRef = useRef(settings.llmSystemPrompt);
  const sessionInitCountRef = useRef(0);
  const messagesRef = useRef(messages);
  const lastActivityRef = useRef(0);
  const silenceTriggeredRef = useRef(false);
  const isSendingRef = useRef(false);
  const isSpeakingRef = useRef(false);

  // Keep refs in sync
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { isSendingRef.current = isSending; }, [isSending]);
  useEffect(() => { isSpeakingRef.current = isSpeaking; }, [isSpeaking]);

  const beginSessionInit = useCallback(() => {
    sessionInitCountRef.current += 1;
    setIsSessionInitializing(true);
  }, []);

  const endSessionInit = useCallback(() => {
    sessionInitCountRef.current = Math.max(0, sessionInitCountRef.current - 1);
    if (sessionInitCountRef.current === 0) {
      setIsSessionInitializing(false);
    }
  }, []);

  const initLLM = useCallback(
    async (initialMessages: ChatMessage[] = []) => {
      beginSessionInit();
      try {
        const status = await llm.checkAvailability();
        setLlmStatus(status);

        switch (status) {
          case "available":
            setNeedsInitialization(false);
            if (!llm.hasSession()) {
              setStatusText("Creating AI session...");
              await llm.createSession(
                settings.llmSystemPrompt,
                getContextHistory(initialMessages)
              );
              appliedSystemPromptRef.current = settings.llmSystemPrompt;
            }
            setStatusText("");
            break;
          case "downloading":
            setNeedsInitialization(true);
            setStatusText('Click "Prepare AI" to download the model.');
            break;
          case "unavailable":
            setNeedsInitialization(false);
            setStatusText("Chrome Built-in AI is not available.");
            break;
          case "error":
            setNeedsInitialization(false);
            setStatusText("Failed to check AI availability.");
            break;
        }
      } catch (e) {
        setNeedsInitialization(true);
        setStatusText(
          e instanceof Error ? e.message : "Failed to create AI session."
        );
        setLlmStatus("error");
      } finally {
        endSessionInit();
      }
    },
    [beginSessionInit, endSessionInit, settings.llmSystemPrompt]
  );

  // Initialize on mount only — LLM + TTS warm up in parallel
  useEffect(() => {
    void initLLM(messagesRef.current);
    // Warm up TTS engine with progress tracking
    void tts
      .initialize(
        (msg) => setTtsStatus(msg ?? ""),
        SPEAKER_FOR_AVATAR[settings.selectedAvatarId]
      )
      .then(() => setTtsReady(true))
      .catch((e) => {
        console.warn("[TTS] warmup failed (will retry on first message):", e);
        setTtsStatus("");
      });
  }, [initLLM]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-create session when system prompt changes (debounced)
  useEffect(() => {
    if (
      appliedSystemPromptRef.current === settings.llmSystemPrompt &&
      llm.hasSession()
    ) {
      return;
    }
    if (isSending || llmStatus !== "available") return;

    let cancelled = false;
    let recreationStarted = false;
    let recreationFinished = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initialization side-effect
    beginSessionInit();
    setStatusText("Updating AI session...");

    const timer = window.setTimeout(() => {
      recreationStarted = true;
      void recreateSession();
    }, SYSTEM_PROMPT_UPDATE_DELAY_MS);

    async function recreateSession() {
      llm.destroySession();
      try {
        await llm.createSession(
          settings.llmSystemPrompt,
          getContextHistory(messagesRef.current)
        );
        if (!cancelled) {
          appliedSystemPromptRef.current = settings.llmSystemPrompt;
          setStatusText("");
        }
      } catch (e) {
        if (!cancelled) {
          setNeedsInitialization(true);
          setLlmStatus("error");
          setErrorMessage(
            e instanceof Error ? e.message : "Failed to update AI session."
          );
          setStatusText("Failed to update AI session.");
        }
      } finally {
        recreationFinished = true;
        endSessionInit();
      }
    }

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (!recreationStarted) endSessionInit();
      else if (!recreationFinished) llm.destroySession();
    };
  }, [
    beginSessionInit,
    endSessionInit,
    isSending,
    llmStatus,
    settings.llmSystemPrompt,
  ]);

  const initializeAI = useCallback(async () => {
    if (isInitializingAI) return;

    setIsInitializingAI(true);
    setNeedsInitialization(true);
    setLlmStatus("downloading");
    setStatusText("Preparing AI model...");
    setErrorMessage("");
    beginSessionInit();

    try {
      await llm.createSession(
        settings.llmSystemPrompt,
        getContextHistory(messagesRef.current),
        (pct) => setStatusText(`Downloading model... ${pct}%`)
      );
      appliedSystemPromptRef.current = settings.llmSystemPrompt;
      setNeedsInitialization(false);
      setLlmStatus("available");
      setStatusText("");
    } catch (e) {
      setNeedsInitialization(true);
      setLlmStatus("downloading");
      setErrorMessage(
        e instanceof Error ? e.message : "Failed to prepare AI model."
      );
      setStatusText(e instanceof Error ? e.message : "Failed to prepare AI.");
    } finally {
      setIsInitializingAI(false);
      endSessionInit();
    }
  }, [
    beginSessionInit,
    endSessionInit,
    isInitializingAI,
    settings.llmSystemPrompt,
  ]);

  const send = useCallback(
    async (text: string) => {
      if (isSending || !text.trim()) return;

      // Track user activity for silence detection
      lastActivityRef.current = Date.now();
      silenceTriggeredRef.current = false;

      setIsSending(true);

      tts.stop();
      setMouthLevel(0);
      setIsSpeaking(false);

      if (!llm.hasSession()) {
        if (llmStatus !== "available") {
          const message = needsInitialization
            ? 'Click "Prepare AI" first.'
            : "AI is not available.";
          setErrorMessage(message);
          setStatusText(message);
          setIsSending(false);
          return;
        }

        beginSessionInit();
        setStatusText("Creating AI session...");
        try {
          await llm.createSession(
            settings.llmSystemPrompt,
            getContextHistory(messagesRef.current)
          );
          appliedSystemPromptRef.current = settings.llmSystemPrompt;
          setStatusText("");
        } catch (e) {
          setErrorMessage(
            e instanceof Error ? e.message : "Failed to create AI session."
          );
          setIsSending(false);
          return;
        } finally {
          endSessionInit();
        }
      }

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: text.trim(),
        timestamp: Date.now(),
      };

      const currentMessages = messagesRef.current;
      const updatedWithUser = [...currentMessages, userMsg];
      setMessages(updatedWithUser);
      saveMessages(updatedWithUser);

      try {
        const reply = await llm.prompt(text.trim());
        const assistantMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: reply,
          timestamp: Date.now(),
        };
        const updatedWithReply = [...updatedWithUser, assistantMsg];
        setMessages(updatedWithReply);
        saveMessages(updatedWithReply);

        if (settings.ttsEnabled) {
          if (!tts.isReady()) {
            setStatusText("Initializing TTS...");
            try {
              await tts.initialize((msg) => {
                if (msg) setStatusText(msg);
              });
              setStatusText("");
            } catch (e) {
              setErrorMessage(
                e instanceof Error ? e.message : "TTS initialization failed."
              );
              console.warn("TTS init error:", e);
              setStatusText("");
            }
          }
          setIsSpeaking(true);
          void tts
            .speak(reply, setMouthLevel, {
              speaker: SPEAKER_FOR_AVATAR[settings.selectedAvatarId] ?? settings.ttsSpeaker ?? undefined,
              lengthScale: toTtsLengthScale(settings.ttsLengthScale),
            })
            .catch((e) => {
              setErrorMessage(
                e instanceof Error ? e.message : "TTS playback failed."
              );
              console.warn("TTS error:", e);
            })
            .finally(() => {
              setMouthLevel(0);
              setIsSpeaking(false);
            });
        }
      } catch (e) {
        setErrorMessage("Failed to get AI response.");
        console.error("LLM error:", e);
        llm.destroySession();
      } finally {
        setIsSending(false);
      }
    },
    [
      beginSessionInit,
      endSessionInit,
      isSending,
      llmStatus,
      needsInitialization,
      settings,
    ]
  );

  // Keep send ref current for silence detector (avoids effect re-run)
  const sendRef = useRef(send);
  useEffect(() => { sendRef.current = send; }, [send]);

  // Silence detection: after 30s of no user activity, auto-send
  // "<silence:30s>" so the AI proactively checks in on the user.
  useEffect(() => {
    if (llmStatus !== "available") return;
    if (lastActivityRef.current === 0) lastActivityRef.current = Date.now();

    const id = window.setInterval(() => {
      // Skip if AI is busy or already triggered
      if (isSendingRef.current || isSpeakingRef.current) return;
      if (silenceTriggeredRef.current) return;
      // Only trigger after the user has chatted at least once
      if (messagesRef.current.length === 0) return;

      if (Date.now() - lastActivityRef.current >= 30_000) {
        silenceTriggeredRef.current = true;
        void sendRef.current("<silence:30s>");
      }
    }, 5_000);

    return () => window.clearInterval(id);
  }, [llmStatus]);

  const reset = useCallback(async () => {
    tts.stop();
    setMouthLevel(0);
    setIsSpeaking(false);
    llm.destroySession();
    setMessages([]);
    saveMessages([]);
    setNeedsInitialization(false);
    beginSessionInit();
    setStatusText("Creating AI session...");
    try {
      const status = await llm.checkAvailability();
      setLlmStatus(status);

      if (status === "available") {
        await llm.createSession(settings.llmSystemPrompt);
        appliedSystemPromptRef.current = settings.llmSystemPrompt;
        setStatusText("");
        return;
      }
      if (status === "downloading") {
        setNeedsInitialization(true);
        setStatusText('Click "Prepare AI" to download the model.');
        return;
      }
      if (status === "unavailable") {
        setStatusText("Chrome Built-in AI is not available.");
        return;
      }
      setStatusText("Failed to check AI availability.");
    } catch (e) {
      setNeedsInitialization(true);
      setLlmStatus("error");
      setStatusText(
        e instanceof Error ? e.message : "Failed to reinitialize AI."
      );
    } finally {
      endSessionInit();
    }
  }, [beginSessionInit, endSessionInit, settings.llmSystemPrompt]);

  const clearError = useCallback(() => setErrorMessage(""), []);

  return {
    messages,
    isSending,
    llmStatus,
    statusText,
    mouthLevel,
    mouthOpen: mouthLevel > 0.18,
    isSpeaking,
    errorMessage,
    canInitializeAI: needsInitialization || isInitializingAI,
    isInitializingAI,
    isSessionInitializing,
    ttsReady,
    ttsStatus,
    initializeAI,
    send,
    reset,
    clearError,
  };
}
