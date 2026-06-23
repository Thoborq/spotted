"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bell,
  Check,
  ChevronRight,
  CircleUser,
  HelpCircle,
  Moon,
  Pencil,
  ShieldCheck,
  User,
} from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { getHistory } from "@/lib/analysis-store";
import { getMemberSince, getProfileName, initialsFor, saveProfileName } from "@/lib/profile";
import { formatMonthYear } from "@/lib/format";

const settings = [
  { icon: CircleUser, label: "Account", available: true },
  { icon: Bell, label: "Benachrichtigungen", available: false },
  { icon: Moon, label: "Darstellung", available: false },
  { icon: ShieldCheck, label: "Datenschutz", available: false },
  { icon: HelpCircle, label: "Hilfe & Support", available: false },
];

export default function ProfilPage() {
  const [name, setName] = useState("");
  const [draftName, setDraftName] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [spotCount, setSpotCount] = useState(0);
  const [memberSince, setMemberSince] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing with localStorage, a client-only external system
    setName(getProfileName());
     
    setSpotCount(getHistory().length);
     
    setMemberSince(getMemberSince());
  }, []);

  function startEditing() {
    setDraftName(name);
    setIsEditing(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function confirmEditing() {
    const trimmed = draftName.trim();
    saveProfileName(trimmed);
    setName(trimmed);
    setIsEditing(false);
  }

  const initials = initialsFor(name);

  return (
    <div className="px-5 pt-4">
      <header className="py-2">
        <h1 className="font-serif text-[32px] font-medium tracking-tight">
          Profil
        </h1>
      </header>

      <Card className="mt-3 overflow-hidden p-0">
        <div className="fabric flex items-center gap-3.5 bg-gradient-to-br from-[#F1E8D8] to-[#D7C6A5] p-5">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-background/55 font-serif text-[19px] font-medium text-foreground/75">
            {initials || <User size={22} className="text-foreground/55" strokeWidth={1.6} />}
          </div>
          <div className="min-w-0 flex-1">
            {isEditing ? (
              <input
                ref={inputRef}
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && confirmEditing()}
                placeholder="Dein Name"
                maxLength={30}
                className="w-full border-b border-foreground/20 bg-transparent pb-0.5 font-serif text-[19px] font-medium tracking-tight text-foreground placeholder:text-foreground/40 focus:outline-none"
              />
            ) : name ? (
              <p className="truncate font-serif text-[19px] font-medium tracking-tight">
                {name}
              </p>
            ) : (
              <p className="truncate font-serif text-[19px] font-medium tracking-tight text-foreground/55">
                Dein Profil
              </p>
            )}
            <p className="text-[13px] leading-[1.35] text-foreground/60">
              {isEditing
                ? "Eingeben und bestätigen"
                : name
                  ? "Lokal gespeichert"
                  : "Tippe zum Bearbeiten"}
            </p>
          </div>
          <button
            onClick={isEditing ? confirmEditing : startEditing}
            aria-label={isEditing ? "Namen speichern" : "Namen bearbeiten"}
            className="tap-scale flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-background/55"
          >
            {isEditing ? (
              <Check size={15} className="text-foreground/70" />
            ) : (
              <Pencil size={15} className="text-foreground/70" />
            )}
          </button>
        </div>
        <div className="grid grid-cols-2 divide-x divide-border">
          <div className="px-2 py-4 text-center">
            <p className="font-serif text-[19px] font-medium tracking-tight">
              {spotCount}
            </p>
            <p className="mt-0.5 text-[11px] text-foreground-secondary">Spots</p>
          </div>
          <div className="px-2 py-4 text-center">
            <p className="font-serif text-[19px] font-medium tracking-tight">
              {memberSince ? formatMonthYear(memberSince) : "—"}
            </p>
            <p className="mt-0.5 text-[11px] text-foreground-secondary">
              Dabei seit
            </p>
          </div>
        </div>
      </Card>

      <h2 className="mt-8 px-1 text-[12.5px] font-semibold uppercase tracking-[0.08em] text-foreground-tertiary">
        Einstellungen
      </h2>
      <Card className="mt-2.5 overflow-hidden p-0">
        {settings.map(({ icon: Icon, label, available }, i) => (
          <button
            key={label}
            onClick={available ? startEditing : undefined}
            disabled={!available}
            className={`tap-scale flex w-full items-center gap-3 px-4 py-3.5 text-left ${
              i !== settings.length - 1 ? "hairline-b" : ""
            } ${available ? "" : "opacity-60"}`}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-secondary">
              <Icon size={16} className="text-foreground-secondary" />
            </div>
            <span className="flex-1 text-[15px] font-medium">{label}</span>
            {available ? (
              <ChevronRight size={16} className="text-foreground-tertiary" />
            ) : (
              <Badge tone="neutral">Bald</Badge>
            )}
          </button>
        ))}
      </Card>

      <p className="mt-7 mb-10 px-1 text-center text-[12.5px] text-foreground-tertiary">
        Spotted speichert deine Daten lokal auf diesem Gerät.
      </p>
    </div>
  );
}
