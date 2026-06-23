const NAME_KEY = "spotted.profile.name.v1";
const EMAIL_KEY = "spotted.profile.email.v1";
const BIRTHDATE_KEY = "spotted.profile.birthdate.v1";
const MEMBER_SINCE_KEY = "spotted.profile.memberSince.v1";

export type Profile = {
  name: string;
  email: string;
  birthdate: string | null;
};

export function getProfile(): Profile {
  if (typeof window === "undefined") return { name: "", email: "", birthdate: null };
  return {
    name: window.localStorage.getItem(NAME_KEY) ?? "",
    email: window.localStorage.getItem(EMAIL_KEY) ?? "",
    birthdate: window.localStorage.getItem(BIRTHDATE_KEY) || null,
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

  if (profile.birthdate !== undefined) {
    if (profile.birthdate) window.localStorage.setItem(BIRTHDATE_KEY, profile.birthdate);
    else window.localStorage.removeItem(BIRTHDATE_KEY);
  }
}

export function isValidEmail(value: string): boolean {
  if (!value) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isCompleteEmail(value: string): boolean {
  return value.trim().length > 0 && isValidEmail(value);
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
