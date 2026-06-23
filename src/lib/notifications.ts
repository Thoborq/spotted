const OPT_IN_KEY = "spotted.notifications.optIn.v1";

export function getNotificationsOptIn(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(OPT_IN_KEY) === "true";
}

export function saveNotificationsOptIn(value: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(OPT_IN_KEY, String(value));
}
