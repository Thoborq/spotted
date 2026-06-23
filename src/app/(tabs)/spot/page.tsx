"use client";

import { useRef } from "react";
import { ImageUp, User } from "lucide-react";
import Button from "@/components/ui/Button";
import IconButton from "@/components/ui/IconButton";
import AnalysisProcessingOverlay from "@/components/AnalysisProcessingOverlay";
import { useAnalysisFlow } from "@/lib/use-analysis-flow";

export default function SpotPage() {
  const { stageIndex, runAnalysis } = useAnalysisFlow();
  const galleryInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void runAnalysis(file);
  }

  if (stageIndex !== null) return <AnalysisProcessingOverlay stageIndex={stageIndex} />;

  return (
    <div className="flex min-h-full flex-col px-5 pt-4">
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />

      <header className="flex items-center justify-between py-2">
        <span className="font-serif text-[22px] italic tracking-tight">
          Spotted
        </span>
        <IconButton href="/profil">
          <User size={18} className="text-foreground-secondary" />
        </IconButton>
      </header>

      <div className="mt-3">
        <h1 className="font-serif text-[32px] font-medium leading-tight tracking-tight">
          Guten Tag.
        </h1>
        <p className="mt-1.5 text-[15px] text-foreground-secondary">
          Was möchtest du heute spotten?
        </p>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-2 py-10 text-center">
        <div className="fabric swatch-0 flex h-20 w-20 items-center justify-center rounded-[28px] shadow-soft">
          <ImageUp size={32} strokeWidth={1.5} className="text-foreground/55" />
        </div>
        <div>
          <p className="font-serif text-[20px] font-medium tracking-tight">
            Bild auswählen
          </p>
          <p className="mt-1.5 max-w-[260px] text-[14px] leading-5 text-foreground-secondary">
            Lade einen Screenshot oder ein Foto aus deiner Galerie hoch, um
            ein Produkt zu erkennen.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 pb-6">
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          onClick={() => galleryInputRef.current?.click()}
        >
          Foto aus Galerie
        </Button>
        <Button href="/shot" variant="ghost" size="lg" className="w-full">
          Jetzt fotografieren
        </Button>
      </div>
    </div>
  );
}
