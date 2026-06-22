"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, ImageIcon, ScanSearch, Sparkles } from "lucide-react";
import Button from "@/components/ui/Button";

export default function ShotPage() {
  const router = useRouter();
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  function startAnalysis() {
    setIsAnalyzing(true);
    setTimeout(() => router.push("/analyse"), 1500);
  }

  if (isAnalyzing) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-10 text-center">
        <div className="relative flex h-28 w-28 items-center justify-center rounded-[32px] bg-accent-soft">
          <ScanSearch
            size={44}
            strokeWidth={1.5}
            className="animate-pulse text-accent-foreground"
          />
        </div>
        <h1 className="mt-7 text-[20px] font-bold tracking-tight">
          Spotted analysiert dein Foto…
        </h1>
        <p className="mt-2 text-[14px] text-foreground-secondary">
          Produkte werden erkannt und mit Alternativen verglichen.
        </p>
        <div className="mt-6 h-1.5 w-48 overflow-hidden rounded-full bg-border">
          <div className="h-full w-1/3 rounded-full bg-accent-strong animate-shimmer" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col px-5 pt-6">
      <header className="px-1">
        <h1 className="text-[28px] font-bold tracking-tight">Spot it.</h1>
        <p className="mt-1 text-[15px] text-foreground-secondary">
          Foto aufnehmen oder Screenshot hochladen
        </p>
      </header>

      <button
        onClick={startAnalysis}
        className="tap-scale mt-6 flex flex-1 flex-col items-center justify-center gap-4 rounded-[32px] border-2 border-dashed border-border bg-surface-secondary/60 py-16"
      >
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-surface shadow-soft">
          <Camera size={32} strokeWidth={1.5} className="text-foreground-secondary" />
        </div>
        <div className="text-center">
          <p className="text-[15px] font-semibold">Tippen zum Aufnehmen</p>
          <p className="mt-1 text-[13px] text-foreground-tertiary">
            oder Bild hierher ziehen
          </p>
        </div>
      </button>

      <div className="mt-5 flex flex-col gap-3 pb-8">
        <Button variant="primary" size="lg" className="w-full" onClick={startAnalysis}>
          <Camera size={18} />
          Foto aufnehmen
        </Button>
        <Button variant="ghost" size="lg" className="w-full" onClick={startAnalysis}>
          <ImageIcon size={18} />
          Aus Galerie wählen
        </Button>
      </div>

      <div className="mb-8 flex items-center gap-2.5 rounded-2xl bg-accent-soft px-4 py-3">
        <Sparkles size={16} className="shrink-0 text-accent-foreground" />
        <p className="text-[12.5px] leading-5 text-foreground-secondary">
          Funktioniert mit Fotos, Screenshots und Bildern aus anderen Apps.
        </p>
      </div>
    </div>
  );
}
