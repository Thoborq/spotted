import type { ReactNode } from "react";

type Tone = "accent" | "neutral" | "match";

const toneClasses: Record<Tone, string> = {
  accent: "bg-accent-soft text-accent-foreground",
  neutral: "bg-surface-secondary text-foreground-secondary",
  match: "bg-match-bg text-match-fg",
};

export default function Badge({
  tone = "accent",
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-semibold tracking-tight ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}
