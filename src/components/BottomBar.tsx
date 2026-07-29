import { useState } from "react";
import { useChatSubmit } from "use-chat-submit";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import styles from "./BottomBar.module.css";

interface Props {
  onSend: (text: string) => void;
  disabled: boolean;
  isSending: boolean;
  statusText: string;
  showInitializeAI: boolean;
  isInitializing: boolean;
  onInitializeAI: () => void;
}

export function BottomBar({
  onSend,
  disabled,
  isSending,
  statusText,
  showInitializeAI,
  isInitializing,
  onInitializeAI,
}: Props) {
  const [text, setText] = useState("");
  const { getTextareaProps, textareaRef } = useChatSubmit({
    onSubmit: submitCurrentText,
    mode: "enter",
  });

  // Optional voice input (Web Speech API). Transcript fills the box; Enter sends.
  const { supported: micSupported, listening, interim, start, stop } =
    useSpeechRecognition({
      lang: "ms-MY",
      onFinal: (t) =>
        setText((prev) => (prev.trim() ? prev.trimEnd() + " " + t : t)),
    });
  // Live preview: typed text plus in-progress recognition.
  const value =
    listening && interim
      ? (text.trim() ? text.trimEnd() + " " : "") + interim
      : text;

  function submitCurrentText() {
    stop();
    if (!text.trim() || disabled) return;
    onSend(text);
    setText("");
    queueMicrotask(() => textareaRef.current?.focus());
  }

  return (
    <div className={styles.bar}>
      {showInitializeAI && (
        <button
          className={styles.prepareBtn}
          onClick={onInitializeAI}
          disabled={isInitializing}
          type="button"
        >
          {isInitializing ? (
            <span className={styles.spinner} />
          ) : null}
          {isInitializing ? "Preparing..." : "Prepare AI"}
        </button>
      )}

      <div className={styles.inputWrap}>
        <textarea
          className={styles.input}
          rows={1}
          placeholder={
            isInitializing
              ? ""
              : isSending
                ? "Thinking..."
                : statusText
                  ? statusText
                  : "Send a message..."
          }
          disabled={disabled}
          {...getTextareaProps({
            value,
            onChange: (e) => setText(e.target.value),
          })}
        />
        {isInitializing && (
          <div className={styles.initializing} role="status" aria-live="polite">
            <span className={styles.spinner} />
            <span>{statusText || "Initializing..."}</span>
          </div>
        )}
      </div>

      {micSupported && (
        <button
          className={`${styles.micBtn} ${listening ? styles.micListening : ""}`}
          onClick={() => (listening ? stop() : start())}
          disabled={disabled}
          type="button"
          aria-label={listening ? "Stop listening" : "Speak message"}
          title={listening ? "Stop listening" : "Voice input (Bahasa Melayu)"}
        >
          {listening ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          ) : (
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          )}
        </button>
      )}

      <button
        className={styles.sendBtn}
        onClick={submitCurrentText}
        disabled={disabled || !text.trim()}
        aria-label="Send message"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
      </button>
    </div>
  );
}
