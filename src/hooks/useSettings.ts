import { useState, useCallback } from "react";
import type { AppSettings } from "../types";
import { DEFAULT_SETTINGS } from "../types";
import { loadSettings, saveSettings } from "../services/storage";

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const resetSettings = useCallback(() => {
    const next = { ...DEFAULT_SETTINGS };
    saveSettings(next);
    setSettings(next);
  }, []);

  return { settings, updateSettings, resetSettings };
}
