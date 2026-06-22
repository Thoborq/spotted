import type { ReactNode } from "react";

type Tone = "accent" | "neutral" | "success";

const toneClasses: Record<Tone, string> = {
  accent: "bg-accent-soft text-accent-foreground",
  neutral: "bg-surface-secondary text-foreground-secondary",
  success: "bg-[#E4EFE3] text-[#3E6B43]",
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
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-semibold tracking-tight ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}
