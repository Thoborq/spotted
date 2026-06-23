const NAME_KEY = "spotted.profile.name.v1";
const EMAIL_KEY = "spotted.profile.email.v1";
const AGE_KEY = "spotted.profile.age.v1";
const MEMBER_SINCE_KEY = "spotted.profile.memberSince.v1";

export type Profile = {
  name: string;
  email: string;
  age: number | null;
};

export function getProfile(): Profile {
  if (typeof window === "undefined") return { name: "", email: "", age: null };
  const storedAge = window.localStorage.getItem(AGE_KEY);
  return {
    name: window.localStorage.getItem(NAME_KEY) ?? "",
    email: window.localStorage.getItem(EMAIL_KEY) ?? "",
    age: storedAge ? Number(storedAge) : null,
  };
}

export function saveProfile(profile: Partial<Profile>) {
  if (typeof window === "undefined") return;

  if (profile.name !== undefined) {
    const trimmed = profile.name.trim();
    if (trimmed) window.localStorage.setItem(NAME_KEY, trimmed);
    else window.localStorage.removeItem(NAME_KEY);
  }

  if (profile.email !== undefined) {
    const trimmed = profile.email.trim();
    if (trimmed) window.localStorage.setItem(EMAIL_KEY, trimmed);
    else window.localStorage.removeItem(EMAIL_KEY);
  }

  if (profile.age !== undefined) {
    if (profile.age && profile.age > 0) window.localStorage.setItem(AGE_KEY, String(profile.age));
    else window.localStorage.removeItem(AGE_KEY);
  }
}

export function isValidEmail(value: string): boolean {
  if (!value) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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
