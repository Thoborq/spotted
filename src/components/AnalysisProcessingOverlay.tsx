import { Check, ScanSearch, Search, Sparkle, Tag } from "lucide-react";

export const STAGE_COUNT = 4;

const stages = [
  {
    label: "Produkt wird erkannt",
    subtitle: "Wir analysieren Farbe, Schnitt und Material aus deinem Foto.",
    icon: ScanSearch,
  },
  {
    label: "Passende Produkte werden gesucht",
    subtitle: "Wir vergleichen mit Artikeln aus verschiedenen Shops.",
    icon: Search,
  },
  {
    label: "Beste Angebote werden ausgewählt",
    subtitle: "Wir wählen die passendsten Treffer für dich.",
    icon: Tag,
  },
  {
    label: "Ergebnis wird erstellt",
    subtitle: "Noch einen Moment – wir bereiten alles für dich vor.",
    icon: Sparkle,
  },
];

export default function AnalysisProcessingOverlay({ stageIndex }: { stageIndex: number }) {
  const clampedIndex = Math.min(stageIndex, stages.length - 1);
  const current = stages[clampedIndex];
  const CurrentIcon = current.icon;
  const progress = ((clampedIndex + 1) / stages.length) * 100;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-background">
      {/*
        Single inner container: max-w-[300px] with px-7 (28px each side).
        Effective content width = 300 - 56 = 244px on any phone.
        ALL children use w-full → identical left/right edges.
        Progress bar and step list share exactly the same width.
      */}
      <div className="flex w-full max-w-[300px] flex-col items-center px-7">

        {/* ── Icon ─────────────────────────────────────────────────────────── */}
        <div className="relative flex h-[84px] w-[84px] items-center justify-center">
          <div className="absolute inset-0 animate-spin rounded-full border-[1.5px] border-dashed border-accent-strong/35 [animation-duration:3s]" />
          <div className="flex h-[64px] w-[64px] items-center justify-center rounded-[20px] bg-accent-soft">
            <CurrentIcon
              size={26}
              strokeWidth={1.5}
              className="text-accent-foreground"
            />
          </div>
        </div>

        {/* ── Title ────────────────────────────────────────────────────────── */}
        <h1 className="mt-6 w-full text-center font-serif text-[20px] font-medium leading-tight tracking-tight text-foreground">
          {current.label}
        </h1>

        {/* ── Subtitle ─────────────────────────────────────────────────────── */}
        <p className="mt-[7px] w-full text-center text-[13px] leading-[1.45] text-foreground-secondary">
          {current.subtitle}
        </p>

        {/* ── Progress bar ─────────────────────────────────────────────────── */}
        <div className="mt-8 h-[2px] w-full overflow-hidden rounded-full bg-border">
          <div
            className="h-full rounded-full bg-accent-strong transition-all duration-700 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* ── Step list ────────────────────────────────────────────────────── */}
        <div className="mt-[18px] w-full">
          {stages.map((stage, i) => {
            const isDone = i < clampedIndex;
            const isCurrent = i === clampedIndex;
            return (
              <div key={stage.label} className="flex items-center gap-3 py-[9px]">
                {/* Step indicator: identical size on every row */}
                <div
                  className={[
                    "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full",
                    isDone
                      ? "bg-foreground text-background"
                      : isCurrent
                        ? "bg-accent-strong text-accent-foreground"
                        : "bg-surface-secondary text-foreground-tertiary",
                  ].join(" ")}
                >
                  {isDone ? (
                    <Check size={11} strokeWidth={3} />
                  ) : (
                    <span className="text-[10px] font-bold leading-none">{i + 1}</span>
                  )}
                </div>

                {/* Label: identical size and baseline on every row */}
                <span
                  className={[
                    "text-[13px] font-medium leading-snug",
                    isCurrent
                      ? "text-foreground"
                      : isDone
                        ? "text-foreground-secondary"
                        : "text-foreground-tertiary",
                  ].join(" ")}
                >
                  {stage.label}
                </span>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
