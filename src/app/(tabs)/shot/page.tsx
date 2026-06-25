"use client";

import { useRef } from "react";
import { Camera } from "lucide-react";
import { useAnalysisFlow } from "@/lib/use-analysis-flow";
import AnalysisProcessingOverlay from "@/components/AnalysisProcessingOverlay";
import AnalysisUnavailable from "@/components/AnalysisUnavailable";

export default function ShotPage() {
  const { stageIndex, outcome, runAnalysis, reset } = useAnalysisFlow();
  const cameraInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void runAnalysis(file);
  }

  if (stageIndex !== null) return <AnalysisProcessingOverlay stageIndex={stageIndex} />;
  if (outcome) return <AnalysisUnavailable outcome={outcome} onDismiss={reset} />;

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

      <header className="py-2">
        <h1 className="font-serif text-[32px] font-medium tracking-tight">
          Shot
        </h1>
        <p className="mt-1 text-[15px] text-foreground-secondary">
          Fotografiere ein Produkt direkt mit deiner Kamera.
        </p>
      </header>

      <button
        onClick={() => cameraInputRef.current?.click()}
        className="tap-scale relative mt-6 flex min-h-[58vh] flex-col items-center justify-center gap-4 overflow-hidden rounded-[32px] bg-[#111111] py-16 shadow-card ring-1 ring-inset ring-white/10"
      >
        <span className="absolute left-5 top-5 h-7 w-7 rounded-tl-lg border-l-2 border-t-2 border-white/40" />
        <span className="absolute right-5 top-5 h-7 w-7 rounded-tr-lg border-r-2 border-t-2 border-white/40" />
        <span className="absolute bottom-5 left-5 h-7 w-7 rounded-bl-lg border-b-2 border-l-2 border-white/40" />
        <span className="absolute bottom-5 right-5 h-7 w-7 rounded-br-lg border-b-2 border-r-2 border-white/40" />

        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/10">
          <Camera size={32} strokeWidth={1.4} className="text-white" />
        </div>
        <div className="text-center">
          <p className="text-[15px] font-semibold text-white">
            Jetzt fotografieren
          </p>
          <p className="mt-1 text-[13px] text-white/55">
            Kamera öffnen und Produkt mittig im Bild halten
          </p>
        </div>
      </button>
    </div>
  );
}
