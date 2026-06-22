"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Search } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import ProductThumb from "@/components/ui/ProductThumb";
import {
  getHistory,
  seedHistoryIfEmpty,
  type StoredAnalysis,
} from "@/lib/analysis-store";
import { dayBucket, formatTime, type DayBucket } from "@/lib/format";

const groups: DayBucket[] = ["Heute", "Gestern", "Diese Woche", "Früher"];

export default function VerlaufPage() {
  const [history, setHistory] = useState<StoredAnalysis[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    seedHistoryIfEmpty();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing with localStorage, a client-only external system
    setHistory(getHistory());
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return history;
    return history.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.brand.toLowerCase().includes(q),
    );
  }, [history, query]);

  return (
    <div className="px-5 pt-4">
      <header className="py-2">
        <h1 className="font-serif text-[32px] font-medium tracking-tight">
          Verlauf
        </h1>
      </header>

      <div className="mt-3 flex items-center gap-2.5 rounded-2xl border border-border bg-surface px-4 py-3 shadow-soft">
        <Search size={17} className="text-foreground-tertiary" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Verlauf durchsuchen"
          className="w-full bg-transparent text-[14px] text-foreground placeholder:text-foreground-tertiary focus:outline-none"
        />
      </div>

      <div className="mt-6 flex flex-col gap-7 pb-10">
        {history.length === 0 && (
          <p className="px-1 text-[14px] text-foreground-secondary">
            Noch keine Spots — scanne dein erstes Produkt.
          </p>
        )}
        {history.length > 0 && filtered.length === 0 && (
          <p className="px-1 text-[14px] text-foreground-secondary">
            Keine Treffer für „{query}“.
          </p>
        )}
        {groups.map((day) => {
          const items = filtered.filter((item) => dayBucket(item.createdAt) === day);
          if (items.length === 0) return null;

          return (
            <section key={day}>
              <h2 className="px-1 text-[13px] font-semibold uppercase tracking-wide text-foreground-tertiary">
                {day}
              </h2>
              <Card className="mt-2.5 overflow-hidden p-0">
                {items.map((item, i) => (
                  <Link
                    key={item.id}
                    href={`/analyse/${item.id}`}
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
                        {item.brand} · {formatTime(item.createdAt)}
                      </p>
                    </div>
                    <Badge tone="match">{item.confidence}%</Badge>
                    <ChevronRight size={16} className="text-foreground-tertiary" />
                  </Link>
                ))}
              </Card>
            </section>
          );
        })}
      </div>
    </div>
  );
}
