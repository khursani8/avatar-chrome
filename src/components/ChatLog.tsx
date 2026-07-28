import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../types";
import styles from "./ChatLog.module.css";

interface Props {
  messages: ChatMessage[];
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function ChatLog({ messages }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);

  // Auto-scroll only if user is at the bottom
  useEffect(() => {
    if (atBottom) {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, atBottom]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    setAtBottom(dist < 60);
  }

  function jumpToBottom() {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
    setAtBottom(true);
  }

  return (
    <div className={styles.wrapper}>
      <div ref={scrollRef} className={styles.scroll} onScroll={handleScroll}>
        {messages.length === 0 && (
          <div className={styles.empty}>Start a conversation...</div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`${styles.msg} ${msg.role === "user" ? styles.user : styles.ai}`}
          >
            <div className={styles.bubble}>
              <span className={styles.text}>{msg.content}</span>
              <span className={styles.time}>{formatTime(msg.timestamp)}</span>
            </div>
          </div>
        ))}
      </div>
      {!atBottom && messages.length > 0 && (
        <button className={styles.jumpBtn} onClick={jumpToBottom} aria-label="Scroll to latest">
          ↓
        </button>
      )}
    </div>
  );
}
