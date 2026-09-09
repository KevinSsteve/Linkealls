export type BusinessOnboardingDraft =
  | { mode: "site"; value: string }
  | { mode: "description"; value: string };

const STORAGE_KEY = "linkealls_business_onboarding";

export function saveBusinessOnboarding(draft: BusinessOnboardingDraft): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // The onboarding page can still be revisited manually if storage is unavailable.
  }
}

export function readBusinessOnboarding(): BusinessOnboardingDraft | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BusinessOnboardingDraft>;
    if (
      (parsed.mode === "site" || parsed.mode === "description") &&
      typeof parsed.value === "string" &&
      parsed.value.trim().length > 0
    ) {
      return { mode: parsed.mode, value: parsed.value };
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