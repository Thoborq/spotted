"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Camera, Sparkles } from "lucide-react";
import Button from "@/components/ui/Button";
import BirthdatePicker from "@/components/ui/BirthdatePicker";
import { isCompleteEmail, saveProfile } from "@/lib/profile";
import { hasCompletedOnboarding, markOnboardingComplete } from "@/lib/onboarding";

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
  const [ready, setReady] = useState(false);
  const [index, setIndex] = useState(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [birthdate, setBirthdate] = useState<string | null>(null);
  const [emailError, setEmailError] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const isLast = index === steps.length - 1;
  const isIntro = index < INTRO_STEPS;

  useEffect(() => {
    if (hasCompletedOnboarding()) {
      router.replace("/spot");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- gates first paint until the redirect check above has run
    setReady(true);
  }, [router]);

  useEffect(() => {
    const ref = index === 3 ? nameInputRef : index === 4 ? emailInputRef : null;
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

  function skip() {
    markOnboardingComplete();
    router.push("/spot");
  }

  function finish() {
    saveProfile({ name, email, birthdate });
    markOnboardingComplete();
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

  if (!ready) return null;

  return (
    <div className="flex min-h-screen flex-col safe-top">
      <div className="flex justify-end px-6 pt-4">
        {isIntro && (
          <button
            onClick={skip}
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
                <div
                  key={i}
                  className="flex w-full shrink-0 flex-col items-center justify-center px-10 text-center"
                >
                  <h1 className="max-w-xs font-serif text-[32px] font-medium leading-[1.15] tracking-tight">
                    Wie heißt du?
                  </h1>
                  <p className="mt-3 max-w-xs text-[15px] leading-6 text-foreground-secondary">
                    So sprechen wir dich in der App an.
                  </p>
                  <input
                    ref={nameInputRef}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleNext()}
                    placeholder="Dein Name"
                    maxLength={30}
                    className="mt-10 w-full max-w-[280px] border-b-2 border-border bg-transparent pb-3 text-center text-[22px] font-medium text-foreground placeholder:text-foreground-tertiary transition-colors focus:border-accent-strong focus:outline-none"
                  />
                </div>
              );
            }

            if (step.kind === "email") {
              return (
                <div
                  key={i}
                  className="flex w-full shrink-0 flex-col items-center justify-center px-10 text-center"
                >
                  <h1 className="max-w-xs font-serif text-[32px] font-medium leading-[1.15] tracking-tight">
                    Wie lautet deine E-Mail?
                  </h1>
                  <p className="mt-3 max-w-xs text-[15px] leading-6 text-foreground-secondary">
                    Damit wir dich über Spotted auf dem Laufenden halten können.
                  </p>
                  <span className="mt-4 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-accent-strong">
                    Pflichtfeld
                  </span>
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
                    className={`mt-3 w-full max-w-[280px] border-b-2 bg-transparent pb-3 text-center text-[22px] font-medium text-foreground placeholder:text-foreground-tertiary transition-colors focus:outline-none ${
                      emailError ? "border-danger" : "border-border focus:border-accent-strong"
                    }`}
                  />
                  {emailError && (
                    <p className="mt-2.5 text-[12.5px] text-danger">
                      Bitte gib eine gültige E-Mail-Adresse ein.
                    </p>
                  )}
                </div>
              );
            }

            if (step.kind === "birthdate") {
              return (
                <div
                  key={i}
                  className="flex w-full shrink-0 flex-col items-center justify-center px-10 text-center"
                >
                  <h1 className="max-w-xs font-serif text-[32px] font-medium leading-[1.15] tracking-tight">
                    Wann hast du Geburtstag?
                  </h1>
                  <p className="mt-3 max-w-xs text-[15px] leading-6 text-foreground-secondary">
                    Optional — du kannst das jederzeit später in deinem Profil
                    ändern.
                  </p>
                  <div className="mt-10 w-full max-w-[280px]">
                    <BirthdatePicker value={birthdate} onChange={setBirthdate} />
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
            {isLast ? "App betreten" : "Weiter"}
          </Button>
        </div>
      </div>
    </div>
  );
}
