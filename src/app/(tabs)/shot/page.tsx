"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, ScanSearch, Sparkle, Tag } from "lucide-react";
import { createAnalysis, saveAnalysisResult } from "@/lib/analysis-store";
import type { AnalysisResult } from "@/lib/analysis-types";

const stages = [
  { label: "Produkt wird erkannt", icon: ScanSearch },
  { label: "Marke wird gesucht", icon: Tag },
  { label: "Alternativen werden verglichen", icon: Sparkle },
];

const STAGE_DURATION = 1150;
const MIN_PROCESSING_MS = STAGE_DURATION * (stages.length - 1);

export default function ShotPage() {
  const router = useRouter();
  const [stageIndex, setStageIndex] = useState<number | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (stageIndex === null || stageIndex >= stages.length - 1) return;
    const timer = setTimeout(
      () => setStageIndex((current) => (current ?? 0) + 1),
      STAGE_DURATION,
    );
    return () => clearTimeout(timer);
  }, [stageIndex]);

  async function runAnalysis(file: File) {
    setStageIndex(0);

    const minDuration = new Promise((resolve) => setTimeout(resolve, MIN_PROCESSING_MS));
    const formData = new FormData();
    formData.append("image", file);

    let analysisId: string;
    try {
      const [response] = await Promise.all([
        fetch("/api/analyze", { method: "POST", body: formData }),
        minDuration,
      ]);
      if (!response.ok) throw new Error(`/api/analyze antwortete mit ${response.status}`);
      const result: AnalysisResult = await response.json();
      analysisId = saveAnalysisResult(result).id;
    } catch (error) {
      console.error("Analyse fehlgeschlagen, falle auf Dummy-Ergebnis zurück:", error);
      await minDuration;
      analysisId = createAnalysis().id;
    }

    router.push(`/analyse/${analysisId}`);
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void runAnalysis(file);
  }

  if (stageIndex !== null) {
    const current = stages[Math.min(stageIndex, stages.length - 1)];
    const CurrentIcon = current.icon;
    const progress = (Math.min(stageIndex + 1, stages.length) / stages.length) * 100;

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
          Spotted vergleicht dein Foto mit tausenden Produkten.
        </p>

        <div className="mt-7 h-1.5 w-48 overflow-hidden rounded-full bg-border">
          <div
            className="h-full rounded-full bg-accent-strong transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="mt-9 flex flex-col gap-3 self-stretch">
          {stages.map((stage, i) => {
            const isDone = i < stageIndex;
            const isCurrent = i === stageIndex;
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

  return (
    <div className="flex flex-col px-5 pt-4">
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />

      <header className="py-2">
        <h1 className="font-serif text-[32px] font-medium tracking-tight">
          Spot it.
        </h1>
        <p className="mt-1 text-[15px] text-foreground-secondary">
          Foto aufnehmen oder Screenshot hochladen
        </p>
      </header>

      <button
        onClick={() => cameraInputRef.current?.click()}
        className="tap-scale relative mt-6 flex min-h-[58vh] flex-col items-center justify-center gap-4 overflow-hidden rounded-[32px] bg-foreground py-16"
      >
        <span className="absolute left-5 top-5 h-7 w-7 border-l-2 border-t-2 border-background/40 rounded-tl-lg" />
        <span className="absolute right-5 top-5 h-7 w-7 border-r-2 border-t-2 border-background/40 rounded-tr-lg" />
        <span className="absolute bottom-5 left-5 h-7 w-7 border-b-2 border-l-2 border-background/40 rounded-bl-lg" />
        <span className="absolute bottom-5 right-5 h-7 w-7 border-b-2 border-r-2 border-background/40 rounded-br-lg" />

        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-background/10">
          <Camera size={32} strokeWidth={1.4} className="text-background" />
        </div>
        <div className="text-center">
          <p className="text-[15px] font-semibold text-background">
            Tippen zum Spotten
          </p>
          <p className="mt-1 text-[13px] text-background/55">
            Halte das Produkt mittig im Bild
          </p>
        </div>
      </button>

      <div className="flex flex-col items-center py-7">
        <button
          onClick={() => galleryInputRef.current?.click()}
          className="tap-scale text-[14px] font-semibold text-foreground-secondary underline-offset-4 hover:underline"
        >
          Aus Galerie wählen
        </button>
      </div>
    </div>
  );
}
