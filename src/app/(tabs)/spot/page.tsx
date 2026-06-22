import Link from "next/link";
import { Camera, ChevronRight, ImageIcon, Lightbulb, User } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import IconButton from "@/components/ui/IconButton";
import ProductThumb from "@/components/ui/ProductThumb";
import { recentSpots } from "@/lib/dummy-data";

export default function SpotPage() {
  return (
    <div className="px-5 pt-4">
      <header className="flex items-center justify-between py-2">
        <span className="text-[20px] font-extrabold tracking-tight">
          Spotted
        </span>
        <IconButton href="/profil">
          <User size={18} className="text-foreground-secondary" />
        </IconButton>
      </header>

      <div className="mt-2">
        <h1 className="text-[30px] font-bold leading-9 tracking-tight">
          Guten Tag 👋
        </h1>
        <p className="mt-1 text-[15px] text-foreground-secondary">
          Was hast du heute entdeckt?
        </p>
      </div>

      <Link href="/shot" className="tap-scale mt-6 block">
        <Card className="flex items-center gap-4 p-5">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-accent-soft">
            <Camera size={28} strokeWidth={1.6} className="text-accent-foreground" />
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

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Link
          href="/shot"
          className="tap-scale flex items-center justify-center gap-2 rounded-2xl border border-border bg-surface py-4 text-[14px] font-semibold shadow-soft"
        >
          <Camera size={17} strokeWidth={1.8} />
          Kamera
        </Link>
        <Link
          href="/shot"
          className="tap-scale flex items-center justify-center gap-2 rounded-2xl border border-border bg-surface py-4 text-[14px] font-semibold shadow-soft"
        >
          <ImageIcon size={17} strokeWidth={1.8} />
          Galerie
        </Link>
      </div>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-[18px] font-bold tracking-tight">
          Zuletzt gespottet
        </h2>
        <Link
          href="/verlauf"
          className="text-[13px] font-medium text-foreground-secondary"
        >
          Alle anzeigen
        </Link>
      </div>

      <div className="-mx-5 mt-3 flex gap-3 overflow-x-auto px-5 pb-1 no-scrollbar">
        {recentSpots.slice(0, 4).map((item) => (
          <Card key={item.id} className="w-36 shrink-0 p-3">
            <ProductThumb icon={item.icon} tone={item.tone} size="lg" />
            <p className="mt-2.5 truncate text-[13px] font-semibold">
              {item.name}
            </p>
            <p className="truncate text-[12px] text-foreground-secondary">
              {item.brand}
            </p>
            <div className="mt-2">
              <Badge tone="success">{item.match}% Treffer</Badge>
            </div>
          </Card>
        ))}
      </div>

      <Card className="mt-8 mb-6 flex gap-3 bg-surface-secondary p-4 shadow-none border-transparent">
        <Lightbulb size={20} className="mt-0.5 shrink-0 text-accent-strong" />
        <p className="text-[13px] leading-5 text-foreground-secondary">
          <span className="font-semibold text-foreground">Tipp:</span> Lade
          einen Screenshot aus Instagram oder Pinterest hoch — Spotted erkennt
          auch Bilder aus Apps.
        </p>
      </Card>
    </div>
  );
}
