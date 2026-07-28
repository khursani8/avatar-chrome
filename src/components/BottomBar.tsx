import { useState } from "react";
import { useChatSubmit } from "use-chat-submit";
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

  function submitCurrentText() {
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
            value: text,
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
