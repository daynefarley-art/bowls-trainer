// Lightweight localStorage-backed dashboard preferences.

const SHOW_GS_KEY = "bt_show_getting_started_card";
const SMART_PROMPT_KEY = "bt_gs_smart_prompt_answered";

export function getShowGettingStartedCard(): boolean {
  if (typeof window === "undefined") return true;
  const v = window.localStorage.getItem(SHOW_GS_KEY);
  return v === null ? true : v === "1";
}

export function setShowGettingStartedCard(show: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SHOW_GS_KEY, show ? "1" : "0");
}

export function hasAnsweredSmartPrompt(): boolean {
  if (typeof window === "undefined") return true;
  return !!window.localStorage.getItem(SMART_PROMPT_KEY);
}

export function markSmartPromptAnswered() {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(SMART_PROMPT_KEY, "1");
  }
}
