import { useEffect, useMemo, useRef, useState } from "react";
import type { AppMode, AppSettings, ChatMessage } from "../types";
import { DEFAULT_SYSTEM_PROMPT, isDefaultSystemPrompt, SPEAKER_FOR_AVATAR } from "../types";
import * as tts from "../services/tts";
import { getAllAvatars, registerAvatar, removeAvatar } from "../services/avatar";
import type { AvatarPack } from "../types";
import styles from "./SettingsPanel.module.css";

interface Props {
  settings: AppSettings;
  messages: ChatMessage[];
  onUpdate: (patch: Partial<AppSettings>) => void;
  onUploadBackgroundImage: (file: File) => Promise<void>;
  onResetBackgroundImage: () => Promise<void>;
  open: boolean;
  onClose: () => void;
  onReset: () => void;
}

type SlotKey = "mouthCloseEyesOpen" | "mouthCloseEyesClose" | "mouthOpenEyesOpen" | "mouthOpenEyesClose";

const SLOTS: { key: SlotKey; label: string }[] = [
  { key: "mouthCloseEyesOpen", label: "Mouth closed, eyes open" },
  { key: "mouthCloseEyesClose", label: "Mouth closed, eyes closed" },
  { key: "mouthOpenEyesOpen", label: "Mouth open, eyes open" },
  { key: "mouthOpenEyesClose", label: "Mouth open, eyes closed" },
];

function toTtsLengthScale(speedMultiplier: number): number {
  return speedMultiplier > 0 ? 1 / speedMultiplier : 1;
}

function escapeCsv(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function SettingsPanel({
  settings,
  messages,
  onUpdate,
  onUploadBackgroundImage,
  onResetBackgroundImage,
  open,
  onClose,
  onReset,
}: Props) {
  const [backgroundBusy, setBackgroundBusy] = useState(false);
  const [backgroundError, setBackgroundError] = useState("");
  const [sampleBusy, setSampleBusy] = useState(false);
  const [sampleStatus, setSampleStatus] = useState("");
  const [sampleError, setSampleError] = useState("");
  const backgroundInputRef = useRef<HTMLInputElement | null>(null);

  // Custom avatar upload state
  const [avatarList, setAvatarList] = useState<AvatarPack[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [slotFiles, setSlotFiles] = useState<Record<SlotKey, File | null>>({
    mouthCloseEyesOpen: null,
    mouthCloseEyesClose: null,
    mouthOpenEyesOpen: null,
    mouthOpenEyesClose: null,
  });
  const [slotPreviews, setSlotPreviews] = useState<Record<SlotKey, string | null>>({
    mouthCloseEyesOpen: null,
    mouthCloseEyesClose: null,
    mouthOpenEyesOpen: null,
    mouthOpenEyesClose: null,
  });
  const [customName, setCustomName] = useState("");
  const [avatarError, setAvatarError] = useState("");
  const slotInputRefs = useRef<Record<SlotKey, HTMLInputElement | null>>({
    mouthCloseEyesOpen: null,
    mouthCloseEyesClose: null,
    mouthOpenEyesOpen: null,
    mouthOpenEyesClose: null,
  });

  const refreshAvatars = () => void getAllAvatars().then(setAvatarList);
  useEffect(refreshAvatars, []);

  const modeOptions = useMemo<{ value: AppMode; label: string }[]>(
    () => [
      { value: "chat", label: "Chat mode" },
      { value: "broadcast", label: "Broadcast mode (green screen)" },
    ],
    []
  );

  // ── CSV export ──
  function handleExportCsv() {
    if (messages.length === 0) return;
    const header = "timestamp,role,content\n";
    const rows = messages
      .map((m) =>
        `${escapeCsv(new Date(m.timestamp).toISOString())},${escapeCsv(m.role)},${escapeCsv(m.content)}`
      )
      .join("\n");
    const blob = new Blob(["﻿" + header + rows], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Background ──
  async function handleBackgroundChange(file: File | null) {
    if (!file || backgroundBusy) return;
    setBackgroundBusy(true);
    setBackgroundError("");
    try {
      await onUploadBackgroundImage(file);
    } catch (e) {
      setBackgroundError(e instanceof Error ? e.message : "Failed to save background.");
    } finally {
      if (backgroundInputRef.current) backgroundInputRef.current.value = "";
      setBackgroundBusy(false);
    }
  }

  async function handleResetBackground() {
    if (!settings.backgroundImageEnabled || backgroundBusy) return;
    setBackgroundBusy(true);
    try {
      await onResetBackgroundImage();
    } catch (e) {
      setBackgroundError(e instanceof Error ? e.message : "Failed to reset.");
    } finally {
      setBackgroundBusy(false);
    }
  }

  // ── Messages ──
  function handleDeleteMessages() {
    if (messages.length === 0) return;
    if (!window.confirm("Delete all messages and reset the conversation?")) return;
    onReset();
  }

  // ── TTS sample ──
  async function handlePlayTtsSample() {
    if (sampleBusy) return;
    setSampleBusy(true);
    setSampleError("");
    setSampleStatus("Preparing...");
    try {
      if (!tts.isReady()) {
        await tts.initialize((msg) => setSampleStatus(msg ?? ""));
      }
      setSampleStatus("Generating speech...");
      await tts.speak("Hello! I'm your AI avatar.", () => undefined, {
        speaker: SPEAKER_FOR_AVATAR[settings.selectedAvatarId] ?? settings.ttsSpeaker ?? undefined,
        lengthScale: toTtsLengthScale(settings.ttsLengthScale),
      });
      setSampleStatus("");
    } catch (e) {
      setSampleStatus("");
      setSampleError(e instanceof Error ? e.message : String(e));
    } finally {
      setSampleBusy(false);
    }
  }

  function handleStopTtsSample() {
    tts.stop();
    setSampleBusy(false);
    setSampleStatus("");
  }

  // ── Custom avatar upload ──
  function handleSlotChange(slot: SlotKey, file: File | null) {
    setSlotFiles((prev) => ({ ...prev, [slot]: file }));
    setSlotPreviews((prev) => {
      const next = { ...prev };
      if (next[slot]) URL.revokeObjectURL(next[slot]!);
      next[slot] = file ? URL.createObjectURL(file) : null;
      return next;
    });
  }

  async function handleRegisterAvatar() {
    setAvatarError("");
    if (!customName.trim()) {
      setAvatarError("Enter a name.");
      return;
    }
    for (const s of SLOTS) {
      if (!slotFiles[s.key]) {
        setAvatarError(`Missing: ${s.label}`);
        return;
      }
    }
    try {
      await registerAvatar(customName.trim(), slotFiles as {
        mouthCloseEyesOpen: File;
        mouthCloseEyesClose: File;
        mouthOpenEyesOpen: File;
        mouthOpenEyesClose: File;
      });
      // Reset form
      for (const s of SLOTS) {
        if (slotPreviews[s.key]) URL.revokeObjectURL(slotPreviews[s.key]!);
      }
      setSlotFiles({ mouthCloseEyesOpen: null, mouthCloseEyesClose: null, mouthOpenEyesOpen: null, mouthOpenEyesClose: null });
      setSlotPreviews({ mouthCloseEyesOpen: null, mouthCloseEyesClose: null, mouthOpenEyesOpen: null, mouthOpenEyesClose: null });
      setCustomName("");
      setShowUpload(false);
      refreshAvatars();
    } catch (e) {
      setAvatarError(e instanceof Error ? e.message : "Failed to register.");
    }
  }

  async function handleDeleteAvatar(id: string) {
    await removeAvatar(id);
    if (settings.selectedAvatarId === id) onUpdate({ selectedAvatarId: "default" });
    refreshAvatars();
  }

  function handleResetPrompt() {
    onUpdate({ llmSystemPrompt: DEFAULT_SYSTEM_PROMPT });
  }

  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>Settings</h2>

        {/* Display mode */}
        <details className={styles.section} open>
          <summary>Display Mode</summary>
          <div className={styles.sectionContent}>
            <label className={styles.label}>
              <select
                className={styles.textInput}
                value={settings.appMode}
                onChange={(e) => onUpdate({ appMode: e.target.value as AppMode })}
              >
                {modeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
          </div>
        </details>

        {/* Background */}
        <details className={styles.section}>
          <summary>Background</summary>
          <div className={styles.sectionContent}>
            <input ref={backgroundInputRef} type="file" accept="image/*" hidden
              onChange={(e) => void handleBackgroundChange(e.target.files?.[0] ?? null)} />
            <div className={styles.actionRow}>
              <button className={styles.subActionBtn} disabled={backgroundBusy}
                onClick={() => backgroundInputRef.current?.click()}>
                {backgroundBusy ? "Saving..." : settings.backgroundImageEnabled ? "Change" : "Select Image"}
              </button>
              <button className={styles.secondaryBtn} disabled={!settings.backgroundImageEnabled || backgroundBusy}
                onClick={() => void handleResetBackground()}>Reset</button>
            </div>
            {backgroundError && <div className={styles.errorText}>{backgroundError}</div>}
          </div>
        </details>

        {/* Avatar */}
        <details className={styles.section}>
          <summary>Avatar</summary>
          <div className={styles.sectionContent}>
            {/* Avatar grid */}
            <div className={styles.avatarGrid}>
              {avatarList.map((a) => (
                <div key={a.id}
                  className={`${styles.avatarCard} ${settings.selectedAvatarId === a.id ? styles.avatarSelected : ""}`}
                  onClick={() => onUpdate({ selectedAvatarId: a.id })}>
                  {a.thumbnailUrl && <img src={a.thumbnailUrl} alt={a.name} className={styles.avatarThumb} />}
                  <span className={styles.avatarCardName}>{a.name}</span>
                  {!a.isBuiltIn && (
                    <button className={styles.avatarDelete} onClick={(e) => { e.stopPropagation(); void handleDeleteAvatar(a.id); }}>×</button>
                  )}
                </div>
              ))}
            </div>

            {/* Upload toggle */}
            {!showUpload ? (
              <button className={styles.secondaryBtn} onClick={() => setShowUpload(true)}>+ Add Custom Avatar</button>
            ) : (
              <div className={styles.uploadForm}>
                <span className={styles.hint}>Upload 4 PNG sprites for a new PNGTuber avatar.</span>
                <input className={styles.textInput} placeholder="Avatar name"
                  value={customName} onChange={(e) => setCustomName(e.target.value)} />
                <div className={styles.slotGrid}>
                  {SLOTS.map((s) => (
                    <div key={s.key} className={styles.slot}>
                      <div className={styles.slotPreview} onClick={() => slotInputRefs.current[s.key]?.click()}>
                        {slotPreviews[s.key] ? (
                          <img src={slotPreviews[s.key]!} alt="" className={styles.slotImg} />
                        ) : (
                          <span className={styles.slotPlus}>+</span>
                        )}
                      </div>
                      <input ref={(el) => { slotInputRefs.current[s.key] = el; }}
                        type="file" accept="image/png" hidden
                        onChange={(e) => handleSlotChange(s.key, e.target.files?.[0] ?? null)} />
                      <span className={styles.slotLabel}>{s.label}</span>
                    </div>
                  ))}
                </div>
                {avatarError && <p className={styles.errorText}>{avatarError}</p>}
                <div className={styles.actionRow}>
                  <button className={styles.subActionBtn} onClick={() => void handleRegisterAvatar()}>Register</button>
                  <button className={styles.secondaryBtn} onClick={() => setShowUpload(false)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        </details>

        {/* AI Voice */}
        <details className={styles.section}>
          <summary>AI & Voice</summary>
          <div className={styles.sectionContent}>
            <label className={styles.label}>
              System Prompt
              <textarea className={styles.textarea} rows={6}
                value={settings.llmSystemPrompt}
                onChange={(e) => onUpdate({ llmSystemPrompt: e.target.value })} />
            </label>
            {isDefaultSystemPrompt(settings.llmSystemPrompt) === false && settings.llmSystemPrompt !== "" && (
              <div className={styles.actionRow}>
                <button className={styles.secondaryBtn} onClick={handleResetPrompt}>Reset to Default</button>
              </div>
            )}
            <label className={styles.toggleLabel}>
              <input type="checkbox" checked={settings.ttsEnabled}
                onChange={(e) => onUpdate({ ttsEnabled: e.target.checked })} />
              Enable Text-to-Speech
            </label>
            <label className={styles.label}>
              Speech Speed: {settings.ttsLengthScale.toFixed(1)}x
              <input type="range" min="0.5" max="2.0" step="0.1"
                value={settings.ttsLengthScale}
                onChange={(e) => onUpdate({ ttsLengthScale: parseFloat(e.target.value) })} />
            </label>
            <div className={styles.ttsSampleBox}>
              <div className={styles.actionRow}>
                <button className={styles.subActionBtn} disabled={sampleBusy}
                  onClick={() => void handlePlayTtsSample()}>
                  {sampleBusy ? "Generating..." : "Play Sample"}
                </button>
                <button className={styles.secondaryBtn} onClick={handleStopTtsSample}>Stop</button>
              </div>
              {sampleStatus && <p className={styles.hint}>{sampleStatus}</p>}
              {sampleError && <p className={styles.errorText}>{sampleError}</p>}
            </div>
          </div>
        </details>

        {/* Chat log */}
        <details className={styles.section}>
          <summary>Chat Log ({messages.length})</summary>
          <div className={styles.sectionContent}>
            <div className={styles.actionRow}>
              <button className={styles.secondaryBtn} disabled={messages.length === 0}
                onClick={handleExportCsv}>Export CSV</button>
              <button className={styles.resetBtn} disabled={messages.length === 0}
                onClick={handleDeleteMessages}>Delete All</button>
            </div>
          </div>
        </details>

        <button className={styles.closeBtn} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
