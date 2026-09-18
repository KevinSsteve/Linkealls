import type { BusinessAnalysisResult } from "./api";

export type BusinessOnboardingDraft = (
  | { mode: "site"; value: string }
  | { mode: "description"; value: string }
  | { mode: "image"; value: string; imageSource?: "instagram" | "business" }
) & { userId?: string; analysis?: BusinessAnalysisResult };

const STORAGE_KEY = "linkealls_business_onboarding";

export function saveBusinessOnboarding(draft: BusinessOnboardingDraft): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    throw new Error("O navegador não conseguiu guardar os dados deste passo. Permite o armazenamento do site ou escolhe configurar mais tarde.");
  }
}

export function readBusinessOnboarding(userId?: string): BusinessOnboardingDraft | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BusinessOnboardingDraft>;
    if (parsed.userId && parsed.userId !== userId) return null;
    if (
      (parsed.mode === "site" || parsed.mode === "description" || parsed.mode === "image") &&
      typeof parsed.value === "string" &&
      parsed.value.trim().length > 0
    ) {
      const analysis = parsed.analysis?.draft && typeof parsed.analysis.draft === "object" &&
        !Array.isArray(parsed.analysis.draft) ? parsed.analysis : undefined;
      if (parsed.mode === "image" && !analysis) return null;
      return { ...parsed, mode: parsed.mode, value: parsed.value, analysis } as BusinessOnboardingDraft;
    }
  } catch {
    // Ignore malformed or unavailable session storage.
  }
  return null;
}

export function clearBusinessOnboarding(): void {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing else is required when storage is unavailable.
  }
}