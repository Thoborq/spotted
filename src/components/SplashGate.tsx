"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

const VISIBLE_MS = 1200;
const FADE_MS = 300;

export default function SplashGate({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<"visible" | "fading" | "hidden">("visible");

  useEffect(() => {
    const fadeTimer = setTimeout(() => setPhase("fading"), VISIBLE_MS);
    const hideTimer = setTimeout(() => setPhase("hidden"), VISIBLE_MS + FADE_MS);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(hideTimer);
    };
  }, []);

  return (
    <>
      {children}
      {phase !== "hidden" && (
        <div
          className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-4 bg-background transition-opacity ease-out"
          style={{
            opacity: phase === "fading" ? 0 : 1,
            transitionDuration: `${FADE_MS}ms`,
          }}
        >
          <Image src="/icon.svg" alt="" width={88} height={88} className="h-[88px] w-[88px]" />
          <span className="font-serif text-[28px] italic tracking-tight text-foreground">
            Spotted
          </span>
        </div>
      )}
    </>
  );
}
