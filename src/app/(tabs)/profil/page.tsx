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

export default function ProfilPage() {
  return (
    <div className="px-5 pt-4">
      <header className="py-2">
        <h1 className="text-[30px] font-bold tracking-tight">Profil</h1>
      </header>

      <Card className="mt-3 flex items-center gap-3.5 p-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#EFE7D8] to-[#D7C6A5] text-[18px] font-bold text-foreground/70">
          LH
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-bold tracking-tight">
            Lea Hoffmann
          </p>
          <p className="truncate text-[13px] text-foreground-secondary">
            lea@spotted.app
          </p>
        </div>
        <button className="tap-scale flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border">
          <Pencil size={15} className="text-foreground-secondary" />
        </button>
      </Card>

      <div className="mt-3 grid grid-cols-3 gap-3">
        {[
          { value: "24", label: "Spots" },
          { value: "6", label: "Favoriten" },
          { value: "06/26", label: "Dabei seit" },
        ].map((stat) => (
          <Card key={stat.label} className="px-3 py-4 text-center shadow-soft">
            <p className="text-[18px] font-bold tracking-tight">{stat.value}</p>
            <p className="mt-0.5 text-[11.5px] text-foreground-secondary">
              {stat.label}
            </p>
          </Card>
        ))}
      </div>

      <h2 className="mt-8 px-1 text-[13px] font-semibold uppercase tracking-wide text-foreground-tertiary">
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
