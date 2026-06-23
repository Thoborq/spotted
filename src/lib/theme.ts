export type ThemePreference = "light" | "dark";

const THEME_KEY = "spotted.theme.v1";

export function getThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "light";
  return window.localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
}

export function applyTheme(pref: ThemePreference) {
  if (typeof window === "undefined") return;
  const isDark = pref === "dark";
  document.documentElement.classList.toggle("dark", isDark);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", isDark ? "#15130f" : "#faf8f5");
}

export function saveThemePreference(pref: ThemePreference) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(THEME_KEY, pref);
  applyTheme(pref);
}
