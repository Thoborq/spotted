"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Camera, Sparkles } from "lucide-react";
import Button from "@/components/ui/Button";
import { isValidEmail, saveProfile } from "@/lib/profile";

const steps = [
  {
    kind: "intro" as const,
    swatch: "swatch-0",
    icon: null,
    titleLines: ["Willkommen bei", "Spotted."],
    subtitle:
      "Erkenne Produkte per Foto, vergleiche Preise und finde die besten Alternativen.",
  },
  {
    kind: "intro" as const,
    swatch: "swatch-1",
    icon: Sparkles,
    titleLines: ["Das ist", "Spot."],
    subtitle:
      "Deine Startseite — hier siehst du deine letzten Spots und startest neue Scans.",
  },
  {
    kind: "intro" as const,
    swatch: "swatch-2",
    icon: Camera,
    titleLines: ["Das ist", "Shot."],
    subtitle:
      "Mach ein Foto oder lade einen Screenshot hoch — Spotted erkennt das Produkt für dich.",
  },
  { kind: "profile" as const },
];

export default function Onboarding() {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [age, setAge] = useState("");
  const [emailError, setEmailError] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const isLast = index === steps.length - 1;

  function goTo(i: number) {
    setIndex(Math.max(0, Math.min(steps.length - 1, i)));
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

  function finish() {
    if (!isValidEmail(email)) {
      setEmailError(true);
      return;
    }
    saveProfile({
      name,
      email,
      age: age ? Number(age) : null,
    });
    router.push("/spot");
  }

  function handleNext() {
    if (isLast) finish();
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
          {steps.map((step, i) => {
            if (step.kind === "profile") {
              return (
                <div
                  key={i}
                  className="flex w-full shrink-0 flex-col px-8 pt-6"
                >
                  <h1 className="font-serif text-[28px] font-medium leading-[1.15] tracking-tight">
                    Richte dein Profil ein
                  </h1>
                  <p className="mt-2 text-[15px] leading-6 text-foreground-secondary">
                    Optional — du kannst das jederzeit später in deinem Profil
                    ändern.
                  </p>

                  <div className="mt-8 flex flex-col gap-4">
                    <div>
                      <label className="mb-2 block px-1 text-[12.5px] font-semibold uppercase tracking-[0.08em] text-foreground-tertiary">
                        Name
                      </label>
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Wie sollen wir dich nennen?"
                        maxLength={30}
                        className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-[15px] text-foreground placeholder:text-foreground-tertiary shadow-soft focus:outline-none focus:ring-2 focus:ring-accent-strong/40"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block px-1 text-[12.5px] font-semibold uppercase tracking-[0.08em] text-foreground-tertiary">
                        E-Mail
                      </label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          setEmailError(false);
                        }}
                        placeholder="Optional"
                        className={`w-full rounded-2xl border bg-surface px-4 py-3 text-[15px] text-foreground placeholder:text-foreground-tertiary shadow-soft focus:outline-none focus:ring-2 focus:ring-accent-strong/40 ${
                          emailError ? "border-danger" : "border-border"
                        }`}
                      />
                      {emailError && (
                        <p className="mt-1.5 px-1 text-[12.5px] text-danger">
                          Das sieht nicht nach einer gültigen E-Mail aus.
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="mb-2 block px-1 text-[12.5px] font-semibold uppercase tracking-[0.08em] text-foreground-tertiary">
                        Alter
                      </label>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={age}
                        onChange={(e) => setAge(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleNext()}
                        placeholder="Optional"
                        min={1}
                        max={120}
                        className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-[15px] text-foreground placeholder:text-foreground-tertiary shadow-soft focus:outline-none focus:ring-2 focus:ring-accent-strong/40"
                      />
                    </div>
                  </div>
                </div>
              );
            }

            const Icon = step.icon;
            return (
              <div
                key={i}
                className="flex w-full shrink-0 flex-col items-center justify-center px-10 text-center"
              >
                <div
                  className={`fabric ${step.swatch} mb-10 flex h-40 w-40 items-center justify-center rounded-[40px] shadow-soft`}
                >
                  {Icon ? (
                    <Icon size={52} strokeWidth={1.4} className="text-foreground/55" />
                  ) : (
                    <Image src="/icon.svg" alt="" width={64} height={64} className="h-16 w-16" />
                  )}
                </div>
                <h1 className="max-w-xs font-serif text-[34px] font-medium leading-[1.15] tracking-tight">
                  {step.titleLines.map((line) => (
                    <span key={line} className="block">
                      {line}
                    </span>
                  ))}
                </h1>
                <p className="mt-4 max-w-xs text-[16px] leading-6 text-foreground-secondary">
                  {step.subtitle}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="safe-bottom">
        <div className="flex flex-col gap-8 px-8 pb-12">
          <div className="flex items-center justify-center gap-2">
            {steps.map((_, i) => (
              <button
                key={i}
                aria-label={`Schritt ${i + 1}`}
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
    </div>
  );
}
