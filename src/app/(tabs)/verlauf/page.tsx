import { ChevronRight, Search } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import ProductThumb from "@/components/ui/ProductThumb";
import { recentSpots, type SpotItem } from "@/lib/dummy-data";

const groups: SpotItem["day"][] = ["Heute", "Gestern", "Diese Woche"];

export default function VerlaufPage() {
  return (
    <div className="px-5 pt-4">
      <header className="py-2">
        <h1 className="font-serif text-[32px] font-medium tracking-tight">
          Verlauf
        </h1>
      </header>

      <div className="mt-3 flex items-center gap-2.5 rounded-2xl border border-border bg-surface px-4 py-3 shadow-soft">
        <Search size={17} className="text-foreground-tertiary" />
        <span className="text-[14px] text-foreground-tertiary">
          Verlauf durchsuchen
        </span>
      </div>

      <div className="mt-6 flex flex-col gap-7 pb-10">
        {groups.map((day) => {
          const items = recentSpots.filter((item) => item.day === day);
          if (items.length === 0) return null;

          return (
            <section key={day}>
              <h2 className="px-1 text-[13px] font-semibold uppercase tracking-wide text-foreground-tertiary">
                {day}
              </h2>
              <Card className="mt-2.5 overflow-hidden p-0">
                {items.map((item, i) => (
                  <div
                    key={item.id}
                    className={`tap-scale flex items-center gap-3 px-4 py-3 ${
                      i !== items.length - 1 ? "hairline-b" : ""
                    }`}
                  >
                    <ProductThumb icon={item.icon} tone={item.tone} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold">
                        {item.name}
                      </p>
                      <p className="truncate text-[13px] text-foreground-secondary">
                        {item.brand} · {item.time}
                      </p>
                    </div>
                    <Badge tone="match">{item.match}%</Badge>
                    <ChevronRight size={16} className="text-foreground-tertiary" />
                  </div>
                ))}
              </Card>
            </section>
          );
        })}
      </div>
    </div>
  );
}
