"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Bell,
  ChevronRight,
  CircleUser,
  HelpCircle,
  Pencil,
  ShieldCheck,
  SunMoon,
  User,
} from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { getHistory } from "@/lib/analysis-store";
import { getMemberSince, getProfile, initialsFor } from "@/lib/profile";
import { getNotificationsOptIn } from "@/lib/notifications";
import { getThemePreference } from "@/lib/theme";
import { formatMonthYear } from "@/lib/format";

const themeLabels = { light: "Hell", dark: "Dunkel", system: "System" } as const;

const settings = [
  { icon: CircleUser, label: "Account", href: "/account" as const },
  { icon: Bell, label: "Benachrichtigungen", href: "/benachrichtigungen" as const },
  { icon: SunMoon, label: "Darstellung", href: "/darstellung" as const },
  { icon: ShieldCheck, label: "Datenschutz", href: "/datenschutz" as const },
  { icon: HelpCircle, label: "Hilfe & Support", href: null },
];

export default function ProfilPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [spotCount, setSpotCount] = useState(0);
  const [memberSince, setMemberSince] = useState<number | null>(null);
  const [notificationsOn, setNotificationsOn] = useState(false);
  const [theme, setTheme] = useState<keyof typeof themeLabels>("system");

  useEffect(() => {
    const profile = getProfile();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing with localStorage, a client-only external system
    setName(profile.name);
    setEmail(profile.email);
    setSpotCount(getHistory().length);
    setMemberSince(getMemberSince());
    setNotificationsOn(getNotificationsOptIn());
    setTheme(getThemePreference());
  }, []);

  const initials = initialsFor(name);
  const subtitle = name ? email || "Lokal gespeichert" : "Tippe zum Bearbeiten";

  return (
    <div className="px-5 pt-4">
      <header className="py-2">
        <h1 className="font-serif text-[32px] font-medium tracking-tight">
          Profil
        </h1>
      </header>

      <Card className="mt-3 overflow-hidden p-0">
        <div className="fabric swatch-0 flex items-center gap-3.5 p-5">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-background/55 font-serif text-[19px] font-medium text-foreground/75">
            {initials || <User size={22} className="text-foreground/55" strokeWidth={1.6} />}
          </div>
          <div className="min-w-0 flex-1">
            {name ? (
              <p className="truncate font-serif text-[19px] font-medium tracking-tight">
                {name}
              </p>
            ) : (
              <p className="truncate font-serif text-[19px] font-medium tracking-tight text-foreground/55">
                Dein Profil
              </p>
            )}
            <p className="truncate text-[13px] leading-[1.35] text-foreground/60">
              {subtitle}
            </p>
          </div>
          <Link
            href="/account"
            aria-label="Profil bearbeiten"
            className="tap-scale flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-background/55"
          >
            <Pencil size={15} className="text-foreground/70" />
          </Link>
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
        {settings.map(({ icon: Icon, label, href }, i) => {
          const preview =
            label === "Benachrichtigungen"
              ? notificationsOn
                ? "An"
                : "Aus"
              : label === "Darstellung"
                ? themeLabels[theme]
                : null;

          const content = (
            <>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-secondary">
                <Icon size={16} className="text-foreground-secondary" />
              </div>
              <span className="flex-1 text-[15px] font-medium">{label}</span>
              {href ? (
                <>
                  {preview && (
                    <span className="text-[13px] text-foreground-tertiary">{preview}</span>
                  )}
                  <ChevronRight size={16} className="text-foreground-tertiary" />
                </>
              ) : (
                <Badge tone="neutral">Bald</Badge>
              )}
            </>
          );

          const rowClassName = `tap-scale flex w-full items-center gap-3 px-4 py-3.5 text-left ${
            i !== settings.length - 1 ? "hairline-b" : ""
          } ${href ? "" : "opacity-60"}`;

          return href ? (
            <Link key={label} href={href} className={rowClassName}>
              {content}
            </Link>
          ) : (
            <div key={label} className={rowClassName}>
              {content}
            </div>
          );
        })}
      </Card>

      <p className="mt-7 mb-10 px-1 text-center text-[12.5px] text-foreground-tertiary">
        Spotted speichert deine Daten lokal auf diesem Gerät.
      </p>
    </div>
  );
}
