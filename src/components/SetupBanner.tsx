/**
 * SetupBanner — actionable guidance when Chrome Built-in AI is unavailable.
 *
 * Three cases, in priority order:
 *   1. Mobile (Android/iOS) — Prompt API not supported yet → say so honestly.
 *   2. Desktop, API present but model can't run → device specs not met.
 *   3. Desktop, API missing → flags off or not Chrome → show flag URLs + steps.
 *
 * Reuses the global `ai-prepare-*` card styles (same as the broadcast "Prepare
 * AI" card) so the look stays consistent without a new stylesheet.
 */

import { useState } from "react";
import { getUnavailableReason } from "../services/llm";

type Platform = "android" | "ios" | "desktop";

function detectPlatform(): Platform {
  const ua = navigator.userAgent || "";
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipod/i.test(ua)) return "ios";
  // iPadOS 13+ reports a desktop UA — detect via touch + Mac platform.
  const isIPad =
    /ipad/i.test(ua) ||
    (navigator.platform === "MacIntel" && (navigator.maxTouchPoints ?? 0) > 1);
  if (isIPad) return "ios";
  return "desktop";
}

const FLAG_URLS = [
  "chrome://flags/#optimization-guide-on-device-model",
  "chrome://flags/#prompt-api-for-gemini-nano",
];

interface Props {
  onRecheck: () => void;
}

export function SetupBanner({ onRecheck }: Props) {
  const [platform] = useState<Platform>(() => detectPlatform());
  const [copied, setCopied] = useState<string | null>(null);
  const reason = getUnavailableReason();

  function copy(text: string) {
    navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(text);
        window.setTimeout(() => setCopied(null), 1500);
      })
      .catch(() => {
        // Clipboard may be blocked; the user can still select/copy manually.
      });
  }

  // Case 1 — mobile platform: Prompt API not shipped here yet.
  if (platform !== "desktop") {
    return (
      <div className="ai-prepare-card">
        <p className="ai-prepare-title">Not supported on this device</p>
        <p className="ai-prepare-text">
          This avatar runs on Chrome&apos;s built-in Gemini Nano, which currently
          only works on <strong>desktop Chrome</strong> (Windows, macOS, Linux,
          ChromeOS). {platform === "ios" ? "iOS" : "Android"} isn&apos;t
          supported yet.
        </p>
        <a
          className="ai-prepare-button"
          href="https://developer.chrome.com/docs/ai/prompt-api"
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: "inline-block", marginTop: 10, textDecoration: "none" }}
        >
          Learn more
        </a>
      </div>
    );
  }

  // Case 2 — desktop, API present but the model can't run here.
  if (reason === "model-unavailable") {
    return (
      <div className="ai-prepare-card">
        <p className="ai-prepare-title">Device doesn&apos;t meet the requirements</p>
        <p className="ai-prepare-text">
          Gemini Nano needs a capable machine: <strong>Chrome 138+</strong>,
          Windows / macOS / Linux / ChromeOS, <strong>16 GB+ RAM</strong>,{" "}
          <strong>22 GB+ free disk</strong>, and a capable GPU (4 GB+ VRAM) or
          enough CPU. Free up space or switch devices, then recheck.
        </p>
        <button
          className="ai-prepare-button"
          type="button"
          onClick={onRecheck}
          style={{ marginTop: 10 }}
        >
          Recheck
        </button>
      </div>
    );
  }

  // Case 3 — desktop, API missing: enable flags (or install Chrome).
  return (
    <div className="ai-prepare-card">
      <p className="ai-prepare-title">Enable Chrome Built-in AI</p>
      <p className="ai-prepare-text">
        You need <strong>Chrome 138+</strong> with Gemini Nano turned on. Paste
        these into Chrome&apos;s address bar, set each to <em>Enabled</em>, then
        relaunch Chrome:
      </p>
      <ul style={{ listStyle: "none", margin: "10px 0", padding: 0 }}>
        {FLAG_URLS.map((url) => (
          <li
            key={url}
            style={{ display: "flex", alignItems: "center", gap: 8, margin: "6px 0" }}
          >
            <code
              style={{
                flex: 1,
                fontSize: 12,
                padding: "6px 8px",
                borderRadius: 6,
                background: "rgba(0, 0, 0, 0.25)",
                overflowWrap: "anywhere",
              }}
            >
              {url}
            </code>
            <button
              type="button"
              onClick={() => copy(url)}
              style={{
                fontSize: 12,
                padding: "6px 10px",
                borderRadius: 6,
                border: "1px solid rgba(255, 255, 255, 0.15)",
                background: "transparent",
                color: "inherit",
                cursor: "pointer",
              }}
            >
              {copied === url ? "Copied" : "Copy"}
            </button>
          </li>
        ))}
      </ul>
      <p className="ai-prepare-status">
        Tip: web pages can&apos;t open chrome:// links directly — copy each URL
        into your address bar.
      </p>
      <button
        className="ai-prepare-button"
        type="button"
        onClick={onRecheck}
        style={{ marginTop: 10 }}
      >
        I&apos;ve enabled it — recheck
      </button>
    </div>
  );
}
