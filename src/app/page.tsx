"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, ScanSearch, Sparkles } from "lucide-react";
import Button from "@/components/ui/Button";

const slides = [
  {
    icon: Camera,
    tone: "from-[#F1E8D8] to-[#D7C6A5]",
    titleLines: ["Erkenne jedes", "Produkt."],
    subtitle:
      "Mach ein Foto oder lade einen Screenshot hoch — Spotted erkennt sofort, was du siehst.",
  },
  {
    icon: ScanSearch,
    tone: "from-[#ECE1D3] to-[#C5A47E]",
    titleLines: ["Original oder", "Alternative?"],
    subtitle:
      "Wir zeigen dir das Original und clevere Alternativen, in Sekunden.",
  },
  {
    icon: Sparkles,
    tone: "from-[#E8ECE2] to-[#B7C4A8]",
    titleLines: ["Bereit zum", "Spotten?"],
    subtitle: "Starte jetzt und entdecke Produkte wie nie zuvor.",
  },
];

export default function Onboarding() {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const isLast = index === slides.length - 1;

  function goTo(i: number) {
    setIndex(Math.max(0, Math.min(slides.length - 1, i)));
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    if (delta < -50) goTo(index + 1);
    else if (delta > 50) goTo(index - 1);
    touchStartX.current = null;
  }

  function handleNext() {
    if (isLast) router.push("/spot");
    else goTo(index + 1);
  }

  return (
    <div className="flex min-h-screen flex-col safe-top">
      <div className="flex justify-end px-6 pt-4">
        {!isLast && (
          <button
            onClick={() => router.push("/spot")}
            className="tap-scale text-[14px] font-medium text-foreground-secondary"
          >
            Überspringen
          </button>
        )}
      </div>

      <div
        className="flex flex-1 touch-pan-y overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="flex w-full transition-transform duration-300 ease-out"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {slides.map((slide, i) => {
            const Icon = slide.icon;
            return (
              <div
                key={i}
                className="flex w-full shrink-0 flex-col items-center justify-center px-10 text-center"
              >
                <div
                  className={`fabric mb-10 flex h-40 w-40 items-center justify-center rounded-[40px] bg-gradient-to-br ${slide.tone} shadow-soft`}
                >
                  <Icon size={52} strokeWidth={1.4} className="text-foreground/55" />
                </div>
                <h1 className="max-w-xs font-serif text-[34px] font-medium leading-[1.15] tracking-tight">
                  {slide.titleLines.map((line) => (
                    <span key={line} className="block">
                      {line}
                    </span>
                  ))}
                </h1>
                <p className="mt-4 max-w-xs text-[16px] leading-6 text-foreground-secondary">
                  {slide.subtitle}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-8 px-8 pb-12">
        <div className="flex items-center justify-center gap-2">
          {slides.map((_, i) => (
            <button
              key={i}
              aria-label={`Slide ${i + 1}`}
              onClick={() => goTo(i)}
              className="tap-scale h-2 rounded-full transition-all"
              style={{
                width: i === index ? 20 : 8,
                backgroundColor: i === index ? "var(--accent-strong)" : "var(--border)",
              }}
            />
          ))}
        </div>
        <Button variant="primary" size="lg" className="w-full" onClick={handleNext}>
          {isLast ? "Los geht's" : "Weiter"}
        </Button>
      </div>
    </div>
  );
}
