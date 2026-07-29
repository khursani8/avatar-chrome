import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Avatar } from "./components/Avatar";
import { ChatLog } from "./components/ChatLog";
import { BottomBar } from "./components/BottomBar";
import { SettingsPanel } from "./components/SettingsPanel";
import { StatusPanel } from "./components/StatusPanel";
import { SetupBanner } from "./components/SetupBanner";
import { Toast } from "./components/Toast";
import { BootOverlay } from "./components/BootOverlay";
import { useChat } from "./hooks/useChat";
import { useSettings } from "./hooks/useSettings";
import { useOnlineStatus } from "./hooks/useOnlineStatus";
import { getDefaultAvatar, getAvatarById } from "./services/avatar";
import {
  deleteBackgroundImage,
  loadBackgroundImage,
  saveBackgroundImage,
} from "./services/storage";
import type { AppSettings, AvatarPack } from "./types";
import { SPEAKER_FOR_AVATAR } from "./types";
import "./App.css";

function AppContent({
  settings,
  updateSettings,
}: {
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
}) {
  const {
    messages,
    isSending,
    llmStatus,
    statusText,
    mouthLevel,
    isSpeaking,
    errorMessage,
    canInitializeAI,
    isInitializingAI,
    isSessionInitializing,
    ttsReady,
    ttsStatus,
    userAfk,
    workingTopic,
    workingEmotion,
    memories,
    speakerLoading,
    speakerLoadProgress,
    initializeAI,
    send,
    reset,
    recheckAI,
    clearError,
  } = useChat(settings);

  const online = useOnlineStatus();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [broadcastHint, setBroadcastHint] = useState(false);
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string | null>(null);
  const broadcastHintTimerRef = useRef<number | null>(null);
  const backgroundUrlRef = useRef<string | null>(null);

  const isBroadcast = settings.appMode === "broadcast";
  const [avatar, setAvatar] = useState<AvatarPack | null>(() => getDefaultAvatar());
  const assistantLabel = avatar?.name ?? "AI";
  const llmReady = llmStatus === "available";

  // Derive AI state for status badge
  const aiState = isSending ? "thinking" : isSpeaking ? "speaking" : userAfk ? "afk" : llmReady ? "listening" : "idle";
  const statusLabel = isSending
    ? "Thinking"
    : isSpeaking
      ? "Speaking"
      : userAfk
        ? "User AFK"
        : llmReady
          ? "Listening"
          : "Offline";

  // Load avatar by selected ID
  useEffect(() => {
    let cancelled = false;
    let ownedAvatar: AvatarPack | undefined;

    async function load() {
      if (settings.selectedAvatarId === "default") {
        setAvatar(getDefaultAvatar());
        return;
      }
      setAvatar(null);
      try {
        const found = await getAvatarById(settings.selectedAvatarId);
        if (!cancelled) {
          if (found && !found.isBuiltIn) ownedAvatar = found;
          setAvatar(found ?? getDefaultAvatar());
        } else {
          found?.dispose?.();
        }
      } catch (e) {
        console.warn("Avatar load error:", e);
        if (!cancelled) setAvatar(getDefaultAvatar());
      }
    }
    void load();
    return () => {
      cancelled = true;
      ownedAvatar?.dispose?.();
    };
  }, [settings.selectedAvatarId]);

  // Ctrl+S / Cmd+S toggles settings
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        setSettingsOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    return () => {
      if (broadcastHintTimerRef.current !== null) clearTimeout(broadcastHintTimerRef.current);
    };
  }, []);

  const handleUpdateSettings = useCallback(
    (patch: Partial<AppSettings>) => {
      if (patch.appMode) {
        if (broadcastHintTimerRef.current !== null) {
          clearTimeout(broadcastHintTimerRef.current);
          broadcastHintTimerRef.current = null;
        }
        if (patch.appMode === "broadcast" && settings.appMode !== "broadcast") {
          setBroadcastHint(true);
          broadcastHintTimerRef.current = window.setTimeout(() => {
            setBroadcastHint(false);
            broadcastHintTimerRef.current = null;
          }, 4000);
        } else if (patch.appMode !== "broadcast") {
          setBroadcastHint(false);
        }
      }
      updateSettings(patch);
    },
    [settings.appMode, updateSettings]
  );

  // Load / unload background image
  useEffect(() => {
    let cancelled = false;
    async function loadBackground() {
      if (!settings.backgroundImageEnabled) {
        if (backgroundUrlRef.current) {
          URL.revokeObjectURL(backgroundUrlRef.current);
          backgroundUrlRef.current = null;
        }
        setBackgroundImageUrl(null);
        return;
      }
      try {
        const stored = await loadBackgroundImage();
        if (!stored) {
          if (!cancelled) {
            setBackgroundImageUrl(null);
            handleUpdateSettings({ backgroundImageEnabled: false, backgroundImageUpdatedAt: 0 });
          }
          return;
        }
        const url = URL.createObjectURL(stored.image);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        if (backgroundUrlRef.current) URL.revokeObjectURL(backgroundUrlRef.current);
        backgroundUrlRef.current = url;
        setBackgroundImageUrl(url);
      } catch (e) {
        console.warn("Background load error:", e);
      }
    }
    void loadBackground();
    return () => { cancelled = true; };
  }, [handleUpdateSettings, settings.backgroundImageEnabled, settings.backgroundImageUpdatedAt]);

  useEffect(() => {
    return () => {
      if (backgroundUrlRef.current) {
        URL.revokeObjectURL(backgroundUrlRef.current);
        backgroundUrlRef.current = null;
      }
    };
  }, []);

  const handleUploadBackgroundImage = useCallback(
    async (file: File) => {
      try {
        await saveBackgroundImage(file, file.name);
        handleUpdateSettings({ backgroundImageEnabled: true, backgroundImageUpdatedAt: Date.now() });
      } catch {
        throw new Error("Failed to save background image.");
      }
    },
    [handleUpdateSettings]
  );

  const handleResetBackgroundImage = useCallback(async () => {
    try {
      await deleteBackgroundImage();
      handleUpdateSettings({ backgroundImageEnabled: false, backgroundImageUpdatedAt: 0 });
    } catch {
      throw new Error("Failed to reset background image.");
    }
  }, [handleUpdateSettings]);

  const appStyle = useMemo(
    () =>
      backgroundImageUrl
        ? {
            backgroundImage: `url("${backgroundImageUrl}")`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
          }
        : undefined,
    [backgroundImageUrl]
  );

  return (
    <div className={`app ${isBroadcast ? "broadcast" : ""}`} style={appStyle}>
      {/* ── Boot overlay — shows during LLM + TTS initialization ── */}
      <BootOverlay
        llmReady={llmReady}
        llmStatus={llmStatus}
        ttsReady={ttsReady}
        ttsStatus={ttsStatus}
        ttsEnabled={settings.ttsEnabled}
      />

      {/* ── Broadcast hint ── */}
      {broadcastHint && (
        <div className="broadcast-hint">
          <p>Broadcast Mode</p>
          <p><kbd>Ctrl</kbd>+<kbd>S</kbd> to open settings</p>
        </div>
      )}

      {/* ── Broadcast: avatar only ── */}
      {isBroadcast && (
        <div className="avatar-stage" style={{ flex: 1 }}>
          {avatar && <Avatar avatar={avatar} mouthLevel={mouthLevel} />}
        </div>
      )}

      {/* ── Broadcast: prepare AI overlay ── */}
      {isBroadcast && canInitializeAI && (
        <div className="ai-prepare-overlay">
          <div className="ai-prepare-card">
            <p className="ai-prepare-title">Prepare AI</p>
            <p className="ai-prepare-text">
              Chrome needs to download the on-device model before the AI can respond.
            </p>
            <button className="ai-prepare-button" type="button" onClick={initializeAI} disabled={isInitializingAI}>
              {isInitializingAI && <span className="spinner" />}
              {isInitializingAI ? "Preparing..." : "Prepare AI"}
            </button>
            {statusText && <p className="ai-prepare-status">{statusText}</p>}
          </div>
        </div>
      )}

      {isBroadcast && isSessionInitializing && !canInitializeAI && (
        <div className="ai-session-status">
          <span className="spinner" />
          <span>{statusText || "AI initializing..."}</span>
        </div>
      )}

      {/* ── Broadcast: AI unavailable guidance ── */}
      {isBroadcast && llmStatus === "unavailable" && (
        <div className="ai-prepare-overlay">
          <SetupBanner onRecheck={recheckAI} />
        </div>
      )}

      {/* ── Chat mode: full layout ── */}
      {!isBroadcast && (
        <>
          {/* Top bar */}
          <header className="topbar">
            <span className="topbar-name">
              <span className={`avatar-dot ${aiState}`} />
              {assistantLabel}
            </span>
            <div className="topbar-spacer" />
            <span className={`status-badge ${aiState}`}>
              <span className="dot" />
              {statusLabel}
            </span>
            <button
              className="topbar-btn"
              onClick={() => setSettingsOpen(true)}
              aria-label="Settings"
              title="Settings (Ctrl+S)"
            >
              &#x2699;
            </button>
          </header>

          {/* Main split */}
          <div className="main">
            {/* Left: avatar + status */}
            <aside className="sidebar">
              <div className="avatar-stage">
                <div className={`avatar-glow ${aiState}`} />
                {avatar ? (
                  <Avatar avatar={avatar} mouthLevel={mouthLevel} />
                ) : (
                  <div className="avatar-loading">Loading...</div>
                )}
              </div>
              <StatusPanel
                mouthLevel={mouthLevel}
                isSpeaking={isSpeaking}
                isSending={isSending}
                speakerName={SPEAKER_FOR_AVATAR[settings.selectedAvatarId] ?? settings.ttsSpeaker}
                ttsEnabled={settings.ttsEnabled}
                messages={messages}
                avatarName={avatar?.name ?? "AI"}
                workingTopic={workingTopic}
                workingEmotion={workingEmotion}
                memories={memories}
                speakerLoading={speakerLoading}
                speakerLoadProgress={speakerLoadProgress}
                online={online}
              />
            </aside>

            {/* Right: conversation + input */}
            <main className="conversation-area">
              {llmStatus === "unavailable" && <SetupBanner onRecheck={recheckAI} />}
              <ChatLog messages={messages} />
              <BottomBar
                onSend={send}
                disabled={!llmReady || isSending || isSessionInitializing}
                isSending={isSending}
                statusText={statusText}
                showInitializeAI={canInitializeAI}
                isInitializing={isSessionInitializing}
                onInitializeAI={initializeAI}
              />
            </main>
          </div>
        </>
      )}

      {/* ── Mobile overlay layout ── */}
      {!isBroadcast && (
        <div className="mobile-layout">
          {/* Full-screen avatar */}
          <div className="mobile-avatar-bg">
            <div className={`avatar-glow ${aiState}`} />
            {avatar && <Avatar avatar={avatar} mouthLevel={mouthLevel} />}
          </div>

          {/* Top bar (minimal) */}
          <div className="mobile-topbar">
            <span className={`status-badge ${aiState}`}>
              <span className="dot" />
              {statusLabel}
            </span>
            <button className="topbar-btn" onClick={() => setSettingsOpen(true)}>⚙</button>
          </div>

          {/* Collapsible chat overlay */}
          {!chatCollapsed && (
            <div className="mobile-chat-overlay">
              <ChatLog messages={messages} />
            </div>
          )}

          {/* Bottom: input or expand button */}
          {chatCollapsed ? (
            <button className="mobile-expand-btn" onClick={() => setChatCollapsed(false)}>
              💬 Show Chat
            </button>
          ) : (
            <div className="mobile-input-wrap">
              <button className="mobile-collapse-btn" onClick={() => setChatCollapsed(true)}>▼</button>
              <BottomBar
                onSend={send}
                disabled={!llmReady || isSending || isSessionInitializing}
                isSending={isSending}
                statusText={statusText}
                showInitializeAI={canInitializeAI}
                isInitializing={isSessionInitializing}
                onInitializeAI={initializeAI}
              />
            </div>
          )}
        </div>
      )}

      <SettingsPanel
        settings={settings}
        messages={messages}
        onUpdate={handleUpdateSettings}
        onUploadBackgroundImage={handleUploadBackgroundImage}
        onResetBackgroundImage={handleResetBackgroundImage}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onReset={reset}
      />

      {errorMessage && <Toast message={errorMessage} onClose={clearError} />}
    </div>
  );
}

export default function App() {
  const { settings, updateSettings } = useSettings();
  return <AppContent settings={settings} updateSettings={updateSettings} />;
}
