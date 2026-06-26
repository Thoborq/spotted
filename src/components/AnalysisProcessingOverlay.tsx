import { Check, ScanSearch, Search, Sparkle, Tag } from "lucide-react";

export const STAGE_COUNT = 4;

const stages = [
  {
    label: "Bild wird analysiert",
    subtitle: "Dein Foto wird verarbeitet und vorbereitet.",
    icon: ScanSearch,
  },
  {
    label: "Produkte werden gesucht",
    subtitle: "Google Lens durchsucht Millionen von Produkten.",
    icon: Search,
  },
  {
    label: "Preise werden verglichen",
    subtitle: "Angebote aus zahlreichen Shops werden analysiert.",
    icon: Tag,
  },
  {
    label: "Beste Treffer werden ausgewählt",
    subtitle: "Die Top-Alternativen werden für dich kuratiert.",
    icon: Sparkle,
  },
];

export default function AnalysisProcessingOverlay({ stageIndex }: { stageIndex: number }) {
  const clampedIndex = Math.min(stageIndex, stages.length - 1);
  const current = stages[clampedIndex];
  const CurrentIcon = current.icon;
  const progress = ((clampedIndex + 1) / stages.length) * 100;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-background px-10 text-center">
      <div className="relative flex h-28 w-28 items-center justify-center">
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-dashed border-accent-strong/50 [animation-duration:3s]" />
        <div className="flex h-20 w-20 items-center justify-center rounded-[28px] bg-accent-soft">
          <CurrentIcon
            size={34}
            strokeWidth={1.5}
            className="animate-pulse text-accent-foreground"
          />
        </div>
      </div>

      <h1 className="mt-8 font-serif text-[22px] font-medium tracking-tight">
        {current.label}…
      </h1>
      <p className="mt-2 text-[14px] text-foreground-secondary">
        {current.subtitle}
      </p>

      <div className="mt-7 h-1.5 w-48 overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-accent-strong transition-all duration-700 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="mt-9 flex flex-col gap-3 self-stretch">
        {stages.map((stage, i) => {
          const isDone = i < clampedIndex;
          const isCurrent = i === clampedIndex;
          return (
            <div key={stage.label} className="flex items-center gap-3">
              <div
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                  isDone
                    ? "bg-foreground text-background"
                    : isCurrent
                      ? "bg-accent-strong text-accent-foreground"
                      : "bg-surface-secondary text-foreground-tertiary"
                }`}
              >
                {isDone ? <Check size={13} strokeWidth={2.5} /> : i + 1}
              </div>
              <span
                className={`text-[14px] ${
                  isCurrent
                    ? "font-semibold text-foreground"
                    : isDone
                      ? "text-foreground-secondary"
                      : "text-foreground-tertiary"
                }`}
              >
                {stage.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
