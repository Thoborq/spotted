"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, ScanSearch } from "lucide-react";

export default function ShotPage() {
  const router = useRouter();
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  function startAnalysis() {
    setIsAnalyzing(true);
    setTimeout(() => router.push("/analyse"), 1500);
  }

  if (isAnalyzing) {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-background px-10 text-center">
        <div className="relative flex h-28 w-28 items-center justify-center">
          <div className="absolute inset-0 animate-spin rounded-full border-2 border-dashed border-accent-strong/50 [animation-duration:3s]" />
          <div className="flex h-20 w-20 items-center justify-center rounded-[28px] bg-accent-soft">
            <ScanSearch
              size={36}
              strokeWidth={1.5}
              className="animate-pulse text-accent-foreground"
            />
          </div>
        </div>
        <h1 className="mt-8 font-serif text-[22px] font-medium tracking-tight">
          Wir suchen deinen Look…
        </h1>
        <p className="mt-2 text-[14px] text-foreground-secondary">
          Produkte werden erkannt und mit Alternativen verglichen.
        </p>
        <div className="mt-7 h-1.5 w-48 overflow-hidden rounded-full bg-border">
          <div className="h-full w-1/3 rounded-full bg-accent-strong animate-shimmer" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col px-5 pt-6">
      <header className="px-1">
        <h1 className="font-serif text-[30px] font-medium tracking-tight">
          Spot it.
        </h1>
        <p className="mt-1 text-[15px] text-foreground-secondary">
          Foto aufnehmen oder Screenshot hochladen
        </p>
      </header>

      <button
        onClick={startAnalysis}
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
          onClick={startAnalysis}
          className="tap-scale text-[14px] font-semibold text-foreground-secondary underline-offset-4 hover:underline"
        >
          Aus Galerie wählen
        </button>
      </div>
    </div>
  );
}
