"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Camera, ChevronRight, Lightbulb, Sparkle, User } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import IconButton from "@/components/ui/IconButton";
import ProductThumb from "@/components/ui/ProductThumb";
import {
  getHistory,
  seedHistoryIfEmpty,
  type StoredAnalysis,
} from "@/lib/analysis-store";

export default function SpotPage() {
  const [recent, setRecent] = useState<StoredAnalysis[]>([]);

  useEffect(() => {
    seedHistoryIfEmpty();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing with localStorage, a client-only external system
    setRecent(getHistory().slice(0, 4));
  }, []);

  return (
    <div className="px-5 pt-4">
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
          Was hast du heute gespottet?
        </p>
      </div>

      <Link href="/shot" className="tap-scale mt-7 block">
        <Card className="flex items-center gap-4 p-5">
          <div className="fabric swatch-0 flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl">
            <Camera size={26} strokeWidth={1.5} className="text-foreground/55" />
          </div>
          <div className="flex-1">
            <p className="text-[17px] font-semibold tracking-tight">
              Neues Foto analysieren
            </p>
            <p className="mt-0.5 text-[14px] text-foreground-secondary">
              Foto aufnehmen oder hochladen
            </p>
          </div>
          <ChevronRight size={20} className="text-foreground-tertiary" />
        </Card>
      </Link>

      {recent.length > 0 && (
        <>
          <div className="mt-9 flex items-center justify-between">
            <h2 className="text-[12.5px] font-semibold uppercase tracking-[0.08em] text-foreground-tertiary">
              Zuletzt gespottet
            </h2>
            <Link
              href="/verlauf"
              className="text-[13px] font-medium text-foreground-secondary"
            >
              Alle anzeigen
            </Link>
          </div>

          <div className="-mx-5 mt-3.5 flex gap-3.5 overflow-x-auto px-5 pb-1 no-scrollbar">
            {recent.map((item) => (
              <Link key={item.id} href={`/analyse/${item.id}`} className="tap-scale">
                <Card className="w-36 shrink-0 p-3.5">
                  <ProductThumb icon={item.icon} tone={item.tone} size="lg" />
                  <p className="mt-3 truncate text-[13.5px] font-semibold">
                    {item.name}
                  </p>
                  <p className="truncate text-[12px] text-foreground-secondary">
                    {item.brand}
                  </p>
                  <div className="mt-2">
                    <Badge tone="match">
                      <Sparkle size={10} strokeWidth={2} />
                      {item.confidence}% Treffer
                    </Badge>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}

      <Card className="mt-8 mb-6 flex gap-3 bg-surface-secondary p-4 shadow-none border-transparent">
        <Lightbulb size={20} className="mt-0.5 shrink-0 text-accent-strong" />
        <p className="text-[13px] leading-5 text-foreground-secondary">
          <span className="font-serif italic text-foreground">Tipp —</span>{" "}
          Lade einen Screenshot aus Instagram oder Pinterest hoch — Spotted
          erkennt auch Bilder aus Apps.
        </p>
      </Card>
    </div>
  );
}
