import {
  Bell,
  ChevronRight,
  CircleUser,
  HelpCircle,
  LogOut,
  Moon,
  Pencil,
  ShieldCheck,
} from "lucide-react";
import Card from "@/components/ui/Card";

const settings = [
  { icon: CircleUser, label: "Account" },
  { icon: Bell, label: "Benachrichtigungen" },
  { icon: Moon, label: "Darstellung" },
  { icon: ShieldCheck, label: "Datenschutz" },
  { icon: HelpCircle, label: "Hilfe & Support" },
];

const stats = [
  { value: "24", label: "Spots" },
  { value: "6", label: "Favoriten" },
  { value: "06/26", label: "Dabei seit" },
];

export default function ProfilPage() {
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
            LH
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-serif text-[19px] font-medium tracking-tight">
              Lea Hoffmann
            </p>
            <p className="truncate text-[13px] text-foreground/60">
              lea@spotted.app
            </p>
          </div>
          <button className="tap-scale flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-background/55">
            <Pencil size={15} className="text-foreground/70" />
          </button>
        </div>
        <div className="grid grid-cols-3 divide-x divide-border">
          {stats.map((stat) => (
            <div key={stat.label} className="px-2 py-4 text-center">
              <p className="font-serif text-[19px] font-medium tracking-tight">
                {stat.value}
              </p>
              <p className="mt-0.5 text-[11px] text-foreground-secondary">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </Card>

      <h2 className="mt-8 px-1 text-[12.5px] font-semibold uppercase tracking-[0.08em] text-foreground-tertiary">
        Einstellungen
      </h2>
      <Card className="mt-2.5 overflow-hidden p-0">
        {settings.map(({ icon: Icon, label }, i) => (
          <button
            key={label}
            className={`tap-scale flex w-full items-center gap-3 px-4 py-3.5 text-left ${
              i !== settings.length - 1 ? "hairline-b" : ""
            }`}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-secondary">
              <Icon size={16} className="text-foreground-secondary" />
            </div>
            <span className="flex-1 text-[15px] font-medium">{label}</span>
            <ChevronRight size={16} className="text-foreground-tertiary" />
          </button>
        ))}
      </Card>

      <button className="tap-scale mt-7 mb-10 flex w-full items-center justify-center gap-2 text-[15px] font-semibold text-danger">
        <LogOut size={16} />
        Abmelden
      </button>
    </div>
  );
}
