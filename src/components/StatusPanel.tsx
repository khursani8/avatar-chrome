import { useState, useEffect } from "react";
import type { AvatarEmotion, ChatMessage } from "../types";
import type { MemoryFact } from "../services/memory";
import styles from "./StatusPanel.module.css";

interface Props {
  mouthLevel: number;
  isSpeaking: boolean;
  isSending: boolean;
  speakerName: string;
  ttsEnabled: boolean;
  messages: ChatMessage[];
  avatarName: string;
  workingTopic: string;
  workingEmotion: AvatarEmotion;
  memories: MemoryFact[];
  speakerLoading: boolean;
  online: boolean;
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
  workingTopic,
  workingEmotion,
  memories,
  speakerLoading,
  online,
}: Props) {
  const voicePct = Math.round(mouthLevel * 100);
  const [uptime, setUptime] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setUptime(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  // Prefer the LLM-derived working topic (real Layer-2 state); fall back to the
  // message heuristic when the model hasn't emitted one yet (e.g. parse failed).
  const topic = workingTopic.trim() || deriveTopic(messages);
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
          {speakerLoading && (
            <span className={`${styles.stateTag} ${styles.thinking}`}>
              <span className={styles.spinner} /> Loading voice
            </span>
          )}
          {!speakerLoading && isSending && (
            <span className={`${styles.stateTag} ${styles.thinking}`}>
              <span className={styles.spinner} /> Thinking
            </span>
          )}
          {!speakerLoading && !isSending && isSpeaking && (
            <span className={`${styles.stateTag} ${styles.speaking}`}>● Speaking</span>
          )}
          {!speakerLoading && !isSending && !isSpeaking && (
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
        <div className={styles.stat}>
          <span className={styles.statValue}>{workingEmotion}</span>
          <span className={styles.statLabel}>Mood</span>
        </div>
        {memories.length > 0 && (
          <div className={styles.stat}>
            <span className={styles.statValue}>{memories.length}</span>
            <span className={styles.statLabel}>Memories</span>
          </div>
        )}
      </div>

      {/* Engine — on-device / offline indicator (bottom-left) */}
      <div className={styles.engine}>
        <span
          className={`${styles.engineDot} ${online ? styles.online : styles.offline}`}
        />
        <span className={styles.engineText}>
          {online ? "Gemini Nano · on-device" : "Offline · running on-device"}
        </span>
      </div>
      <p className={styles.privacy}>
        Runs in your browser · conversations stay on your device
      </p>
    </div>
  );
}
