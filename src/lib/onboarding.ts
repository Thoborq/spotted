const COMPLETED_KEY = "spotted.onboarding.completed.v1";

export function hasCompletedOnboarding(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(COMPLETED_KEY) === "true";
}

export function markOnboardingComplete() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(COMPLETED_KEY, "true");
}
