"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, Gem, ShieldCheck, Sparkle, Star, Tag } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import IconButton from "@/components/ui/IconButton";
import ProductThumb from "@/components/ui/ProductThumb";
import { getAnalysisById, type StoredAlternative, type StoredAnalysis } from "@/lib/analysis-store";
import { formatPrice } from "@/lib/format";

const roleMeta: Record<StoredAlternative["role"], { label: string; icon: typeof Star }> = {
  best: { label: "Beste Alternative", icon: Star },
  cheapest: { label: "Günstigste Alternative", icon: Tag },
  premium: { label: "Premium Alternative", icon: Gem },
};

const roleOrder: StoredAlternative["role"][] = ["best", "cheapest", "premium"];

export default function AnalyseClient({ id }: { id: string }) {
  const router = useRouter();
  const [analysis, setAnalysis] = useState<StoredAnalysis | null | undefined>(undefined);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing with localStorage, a client-only external system
    setAnalysis(getAnalysisById(id) ?? null);
  }, [id]);

  if (analysis === undefined) return null;

  if (analysis === null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-10 text-center">
        <p className="font-serif text-[20px] font-medium">
          Analyse nicht gefunden.
        </p>
        <Button href="/shot" variant="primary" size="md">
          Neu scannen
        </Button>
      </div>
    );
  }

  const { name, brand, confidence, category, original, alternatives } = analysis;
  const sortedAlternatives = roleOrder
    .map((role) => alternatives.find((alt) => alt.role === role))
    .filter((alt): alt is StoredAlternative => Boolean(alt));

  return (
    <div className="flex min-h-screen flex-col safe-top">
      <header className="flex items-center gap-3 px-4 pt-4">
        <IconButton onClick={() => router.back()}>
          <ArrowLeft size={18} />
        </IconButton>
        <h1 className="text-[17px] font-bold tracking-tight">Ergebnis</h1>
      </header>

      <div className="flex-1 px-5 pb-32 pt-5">
        <div className="relative">
          <ProductThumb icon={analysis.icon} tone={analysis.tone} size="xl" />
          <div className="absolute right-3 top-3">
            <Badge tone="match">
              <Sparkle size={11} strokeWidth={2} />
              {confidence}%
            </Badge>
          </div>
        </div>

        <div className="mt-5">
          <Badge tone="neutral">{category}</Badge>
          <h2 className="mt-2 font-serif text-[28px] font-medium leading-8 tracking-tight">
            {name}
          </h2>
          <p className="mt-0.5 text-[15px] text-foreground-secondary">{brand}</p>
          <p className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-match-fg">
            <ShieldCheck size={14} strokeWidth={2} />
            Vertrauensscore {confidence}%
          </p>
        </div>

        <h3 className="mt-7 px-0.5 text-[13px] font-semibold uppercase tracking-wide text-foreground-tertiary">
          Original
        </h3>
        <Card className="mt-2.5 flex items-center gap-4 p-4">
          <ProductThumb icon={analysis.icon} tone={analysis.tone} size="md" />
          <div className="flex-1">
            <p className="text-[15px] font-semibold">{original.store}</p>
            <p className="text-[16px] font-bold tracking-tight">
              {formatPrice(original.price)}
            </p>
          </div>
          <Button variant="ghost" size="sm">
            <ExternalLink size={14} />
            Shop
          </Button>
        </Card>

        <div className="mt-7 flex items-center justify-between px-0.5">
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-foreground-tertiary">
            Alternativen
          </h3>
          <span className="text-[12px] font-medium text-foreground-tertiary">
            {sortedAlternatives.length} gefunden
          </span>
        </div>

        <div className="mt-2.5 flex flex-col gap-3">
          {sortedAlternatives.map((alt) => {
            const meta = roleMeta[alt.role];
            const RoleIcon = meta.icon;
            return (
              <Card
                key={alt.role}
                className={
                  alt.role === "best"
                    ? "border-accent-strong/40 bg-accent-soft/30 p-4"
                    : "p-4"
                }
              >
                <div className="mb-3 inline-flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-accent-strong">
                  <RoleIcon size={13} strokeWidth={2} />
                  {meta.label}
                </div>
                <div className="flex items-center gap-4">
                  <ProductThumb icon={analysis.icon} tone={alt.role === "best" ? analysis.tone : (analysis.tone + 2)} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold">{alt.name}</p>
                    <p className="truncate text-[13px] text-foreground-secondary">
                      {alt.store}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[15px] font-bold tracking-tight">
                      {formatPrice(alt.price)}
                    </p>
                    <p className="text-[11.5px] font-medium text-save">
                      spart {alt.savingsPercent}%
                    </p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 hairline-t bg-background/85 backdrop-blur-xl safe-bottom">
        <div className="mx-auto flex items-center justify-between gap-3 px-5 py-4">
          <Button href="/shot" variant="text" size="md" className="px-3">
            Erneut scannen
          </Button>
          <Button href="/spot" variant="primary" size="md" className="flex-1">
            Fertig
          </Button>
        </div>
      </div>
    </div>
  );
}
