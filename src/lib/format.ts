export type DayBucket = "Heute" | "Gestern" | "Diese Woche" | "Früher";

export function dayBucket(timestamp: number): DayBucket {
  const now = new Date();
  const date = new Date(timestamp);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round(
    (startOfToday.getTime() - startOfDate.getTime()) / 86_400_000,
  );
  if (diffDays <= 0) return "Heute";
  if (diffDays === 1) return "Gestern";
  if (diffDays <= 7) return "Diese Woche";
  return "Früher";
}

export function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const bucket = dayBucket(timestamp);
  const time = date.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (bucket === "Heute" || bucket === "Gestern") return time;
  const weekday = date.toLocaleDateString("de-DE", { weekday: "short" });
  return `${weekday}, ${time}`;
}

export function formatPrice(value: number): string {
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value) + " €";
}

export function formatMonthYear(timestamp: number): string {
  return new Date(timestamp)
    .toLocaleDateString("de-DE", { month: "short", year: "2-digit" })
    .replace(".", "");
}
