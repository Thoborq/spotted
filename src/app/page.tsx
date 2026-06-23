"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Camera, Sparkles } from "lucide-react";
import Button from "@/components/ui/Button";
import { isCompleteEmail, saveProfile } from "@/lib/profile";

const today = new Date().toISOString().slice(0, 10);

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
  { kind: "name" as const },
  { kind: "email" as const },
  { kind: "birthdate" as const },
];

const INTRO_STEPS = 3;

export default function Onboarding() {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [emailError, setEmailError] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const birthdateInputRef = useRef<HTMLInputElement>(null);
  const isLast = index === steps.length - 1;
  const isIntro = index < INTRO_STEPS;

  useEffect(() => {
    const ref =
      index === 3 ? nameInputRef : index === 4 ? emailInputRef : index === 5 ? birthdateInputRef : null;
    if (!ref) return;
    const id = setTimeout(() => ref.current?.focus(), 320);
    return () => clearTimeout(id);
  }, [index]);

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
    saveProfile({ name, email, birthdate: birthdate || null });
    router.push("/spot");
  }

  function handleNext() {
    if (steps[index].kind === "email" && !isCompleteEmail(email)) {
      setEmailError(true);
      return;
    }
    if (isLast) finish();
    else goTo(index + 1);
  }

  return (
    <div className="flex min-h-screen flex-col safe-top">
      <div className="flex justify-end px-6 pt-4">
        {isIntro && (
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
            if (step.kind === "name") {
              return (
                <div key={i} className="flex w-full shrink-0 flex-col px-8 pt-10">
                  <h1 className="font-serif text-[30px] font-medium leading-[1.15] tracking-tight">
                    Wie heißt du?
                  </h1>
                  <p className="mt-2 text-[15px] leading-6 text-foreground-secondary">
                    Optional — so sprechen wir dich in der App an.
                  </p>
                  <input
                    ref={nameInputRef}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleNext()}
                    placeholder="Dein Name"
                    maxLength={30}
                    className="mt-8 w-full rounded-2xl border border-border bg-surface px-4 py-3.5 text-[17px] text-foreground placeholder:text-foreground-tertiary shadow-soft focus:outline-none focus:ring-2 focus:ring-accent-strong/40"
                  />
                </div>
              );
            }

            if (step.kind === "email") {
              return (
                <div key={i} className="flex w-full shrink-0 flex-col px-8 pt-10">
                  <h1 className="font-serif text-[30px] font-medium leading-[1.15] tracking-tight">
                    Wie lautet deine E-Mail?
                  </h1>
                  <p className="mt-2 text-[15px] leading-6 text-foreground-secondary">
                    Damit wir dich über Spotted auf dem Laufenden halten können.
                  </p>
                  <input
                    ref={emailInputRef}
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setEmailError(false);
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleNext()}
                    placeholder="du@beispiel.de"
                    className={`mt-8 w-full rounded-2xl border bg-surface px-4 py-3.5 text-[17px] text-foreground placeholder:text-foreground-tertiary shadow-soft focus:outline-none focus:ring-2 focus:ring-accent-strong/40 ${
                      emailError ? "border-danger" : "border-border"
                    }`}
                  />
                  {emailError && (
                    <p className="mt-2 px-1 text-[12.5px] text-danger">
                      Bitte gib eine gültige E-Mail-Adresse ein.
                    </p>
                  )}
                </div>
              );
            }

            if (step.kind === "birthdate") {
              return (
                <div key={i} className="flex w-full shrink-0 flex-col px-8 pt-10">
                  <h1 className="font-serif text-[30px] font-medium leading-[1.15] tracking-tight">
                    Wann hast du Geburtstag?
                  </h1>
                  <p className="mt-2 text-[15px] leading-6 text-foreground-secondary">
                    Optional — du kannst das jederzeit später in deinem Profil
                    ändern.
                  </p>
                  <input
                    ref={birthdateInputRef}
                    type="date"
                    value={birthdate}
                    onChange={(e) => setBirthdate(e.target.value)}
                    max={today}
                    className="mt-8 w-full rounded-2xl border border-border bg-surface px-4 py-3.5 text-[17px] text-foreground placeholder:text-foreground-tertiary shadow-soft focus:outline-none focus:ring-2 focus:ring-accent-strong/40"
                  />
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
