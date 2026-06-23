"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Moon, Sun } from "lucide-react";
import Card from "@/components/ui/Card";
import IconButton from "@/components/ui/IconButton";
import {
  applyTheme,
  getThemePreference,
  saveThemePreference,
  type ThemePreference,
} from "@/lib/theme";

const options: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Hell", icon: Sun },
  { value: "dark", label: "Dunkel", icon: Moon },
];

export default function DarstellungPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<ThemePreference>("light");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing with localStorage, a client-only external system
    setSelected(getThemePreference());
  }, []);

  function choose(pref: ThemePreference) {
    setSelected(pref);
    saveThemePreference(pref);
    applyTheme(pref);
  }

  return (
    <div className="flex min-h-screen flex-col safe-top">
      <header className="flex items-center gap-3 px-4 pt-4">
        <IconButton onClick={() => router.back()}>
          <ArrowLeft size={18} />
        </IconButton>
        <h1 className="text-[17px] font-bold tracking-tight">Darstellung</h1>
      </header>

      <div className="flex-1 px-5 pb-10 pt-5">
        <Card className="overflow-hidden p-0">
          {options.map(({ value, label, icon: Icon }, i) => (
            <button
              key={value}
              onClick={() => choose(value)}
              className={`tap-scale flex w-full items-center gap-3 px-4 py-3.5 text-left ${
                i !== options.length - 1 ? "hairline-b" : ""
              }`}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-secondary">
                <Icon size={16} className="text-foreground-secondary" />
              </div>
              <span className="flex-1 text-[15px] font-medium">{label}</span>
              {selected === value && (
                <Check size={17} className="text-accent-strong" strokeWidth={2.5} />
              )}
            </button>
          ))}
        </Card>
      </div>
    </div>
  );
}
