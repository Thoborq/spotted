const NAME_KEY = "spotted.profile.name.v1";
const MEMBER_SINCE_KEY = "spotted.profile.memberSince.v1";

export function getProfileName(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(NAME_KEY) ?? "";
}

export function saveProfileName(name: string) {
  if (typeof window === "undefined") return;
  const trimmed = name.trim();
  if (trimmed) window.localStorage.setItem(NAME_KEY, trimmed);
  else window.localStorage.removeItem(NAME_KEY);
}

export function getMemberSince(): number {
  if (typeof window === "undefined") return Date.now();
  const stored = window.localStorage.getItem(MEMBER_SINCE_KEY);
  if (stored) return Number(stored);
  const now = Date.now();
  window.localStorage.setItem(MEMBER_SINCE_KEY, String(now));
  return now;
}

export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
