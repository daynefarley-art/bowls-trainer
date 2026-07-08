import { useEffect, useState, useCallback } from "react";

const KEY = "bowls.demoMode";

export function isDemoMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}

export function setDemoMode(on: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, on ? "on" : "off");
    window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
  } catch {}
}

export function useDemoMode(): { enabled: boolean; setEnabled: (v: boolean) => void } {
  const [enabled, setEnabled] = useState<boolean>(() => isDemoMode());

  useEffect(() => {
    function onChange(e: StorageEvent) {
      if (!e.key || e.key === KEY) setEnabled(isDemoMode());
    }
    window.addEventListener("storage", onChange);
    return () => window.removeEventListener("storage", onChange);
  }, []);

  const set = useCallback((v: boolean) => {
    setDemoMode(v);
    setEnabled(v);
  }, []);

  return { enabled, setEnabled: set };
}

export function isDemoId(id?: string | null): boolean {
  return !!id && id.startsWith("demo-");
}

export function newDemoId(): string {
  return `demo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
