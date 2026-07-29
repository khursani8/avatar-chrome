import { useState, useEffect } from "react";
import type { ChatMessage } from "../types";
import styles from "./StatusPanel.module.css";

interface Props {
  mouthLevel: number;
  isSpeaking: boolean;
  isSending: boolean;
  speakerName: string;
  ttsEnabled: boolean;
  messages: ChatMessage[];
  avatarName: string;
}

// Leading filler words (Malay + English) stripped so the topic reflects the
// subject of a reply rather than a greeting or interjection.
const TOPIC_FILLER_WORDS = new Set([
  "hai", "hello", "hi", "hey", "oh", "wah", "eh", "ya", "yeah", "yes",
  "um", "uh", "hmm", "okay", "ok", "jadi", "well", "so", "wow", "ooo",
]);

function extractTopic(text: string): string {
  const tokens = text.replace(/\s+/g, " ").trim().split(" ");
  let i = 0;
  while (
    i < tokens.length &&
    TOPIC_FILLER_WORDS.has(tokens[i].toLowerCase().replace(/[^a-z]/g, ""))
  ) {
    i++;
  }
  const words = tokens.slice(i, i + 6).join(" ").trim();
  if (!words) return "—";
  return words.length > 32
    ? words.slice(0, 31).replace(/[\s.,;:!?]+$/, "") + "…"
    : words;
}

function deriveTopic(messages: ChatMessage[]): string {
  // Exclude synthetic auto-prompts (e.g. "<silence:30s:1>") — not real turns.
  const real = messages.filter(
    (m) => !m.content.trim().startsWith("<silence:")
  );
  // Reflect the current subject: prefer the avatar's latest reply, fall back
  // to the opening user message. Never mirror the latest user input verbatim.
  for (let i = real.length - 1; i >= 0; i--) {
    if (real[i].role === "assistant") return extractTopic(real[i].content);
  }
  const opener = real.find((m) => m.role === "user");
  return opener ? extractTopic(opener.content) : "—";
}

export function StatusPanel({
  mouthLevel,
  isSpeaking,
  isSending,
  speakerName,
  ttsEnabled,
  messages,
  avatarName,
}: Props) {
  const voicePct = Math.round(mouthLevel * 100);
  const [uptime, setUptime] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setUptime(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  const topic = deriveTopic(messages);
  const msgCount = messages.length;
  const mins = Math.floor(uptime / 60);
  const secs = uptime % 60;

  return (
    <div className={styles.panel}>
      {/* Topic */}
      <div className={styles.topicRow}>
        <span className={styles.label}>Topic</span>
        <span className={styles.topicValue}>{topic}</span>
      </div>

      {/* Voice level */}
      <div className={styles.row}>
        <span className={styles.label}>Voice</span>
        <div className={styles.bar}>
          <div
            className={`${styles.barFill} ${isSpeaking ? styles.active : ""}`}
            style={{ width: `${voicePct}%` }}
          />
        </div>
        <span className={styles.value}>{voicePct}%</span>
      </div>

      {/* State */}
      <div className={styles.row}>
        <span className={styles.label}>State</span>
        <div className={styles.stateWrap}>
          {isSending && (
            <span className={`${styles.stateTag} ${styles.thinking}`}>
              <span className={styles.spinner} /> Thinking
            </span>
          )}
          {!isSending && isSpeaking && (
            <span className={`${styles.stateTag} ${styles.speaking}`}>● Speaking</span>
          )}
          {!isSending && !isSpeaking && (
            <span className={`${styles.stateTag} ${styles.idle}`}>● Idle</span>
          )}
        </div>
      </div>

      {/* Stats grid */}
      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statValue}>{msgCount}</span>
          <span className={styles.statLabel}>Messages</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}</span>
          <span className={styles.statLabel}>Session</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{avatarName}</span>
          <span className={styles.statLabel}>Avatar</span>
        </div>
        {ttsEnabled && speakerName && (
          <div className={styles.stat}>
            <span className={styles.statValue}>{speakerName}</span>
            <span className={styles.statLabel}>Voice</span>
          </div>
        )}
      </div>
    </div>
  );
}
