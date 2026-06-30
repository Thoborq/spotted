"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bug, ChevronDown, ChevronUp, ExternalLink, Gem, ShieldCheck, Sparkle, Star, Tag, X } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import IconButton from "@/components/ui/IconButton";
import ProductThumb from "@/components/ui/ProductThumb";
import { getAnalysisById, type StoredAlternative, type StoredAnalysis } from "@/lib/analysis-store";
import { getDebugData, DEBUG_SESSION_KEY } from "@/lib/use-analysis-flow";
import { formatPrice } from "@/lib/format";
import type { PipelineDebug, ProductIdentityDebug } from "@/lib/analysis-types";

// ---------------------------------------------------------------------------
// CardLink — makes the entire card clickable, opens a real product URL.
// ---------------------------------------------------------------------------
function CardLink({
  url,
  debugTitle,
  debugShop,
  children,
  className = "",
}: {
  url: string | undefined | null;
  debugTitle: string;
  debugShop: string;
  children: React.ReactNode;
  className?: string;
}) {
  const clean = url && url.trim() !== "" && url !== "#" ? url.trim() : undefined;

  if (!clean) {
    console.log(
      `[ProductCard] title="${debugTitle}" shop="${debugShop}" url="(none)" clicked=no — hidden`,
    );
    return null;
  }

  return (
    <a
      href={clean}
      target="_blank"
      rel="noopener noreferrer"
      className={`block ${className}`}
      onClick={(e) => {
        e.preventDefault();
        console.log(
          `[ProductCard] title="${debugTitle}" shop="${debugShop}" url="${clean}" clicked=yes`,
        );
        window.open(clean, "_blank", "noopener,noreferrer");
      }}
    >
      {children}
    </a>
  );
}

// ---------------------------------------------------------------------------
// IdentityCard — product identity block shown at top of debug overlay
// ---------------------------------------------------------------------------
function IdentityCard({ identity }: { identity: ProductIdentityDebug }) {
  const conf = identity.confidence;
  const confColor =
    conf >= 90 ? "text-green-600" :
    conf >= 70 ? "text-yellow-600" :
    "text-red-500";

  return (
    <div className="mb-4 rounded-lg border border-border bg-background p-3">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-foreground-tertiary">
        Erkannte Produktidentität
      </p>
      <div className="flex items-baseline gap-2">
        <span className="text-[14px] font-bold text-foreground">
          {identity.brand}{identity.model ? ` ${identity.model}` : ""}{!identity.brand && !identity.model ? identity.productType : ""}
        </span>
        <span className={`text-[12px] font-semibold ${confColor}`}>{conf}% Konfidenz</span>
      </div>
      {identity.productType && (identity.brand || identity.model) && (
        <p className="text-[11px] text-foreground-secondary">{identity.productType}</p>
      )}
      <div className="mt-2 rounded bg-surface-secondary px-2 py-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground-tertiary">Exact Query</p>
        <p className="mt-0.5 break-all font-mono text-[11px] text-foreground">
          {identity.exactProductQuery || <span className="text-red-500 italic">— fehlt —</span>}
        </p>
      </div>
      {identity.fallbackQueries.length > 0 && (
        <div className="mt-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground-tertiary">Fallback Queries</p>
          {identity.fallbackQueries.map((q, i) => (
            <p key={i} className="mt-0.5 break-all font-mono text-[11px] text-foreground-secondary">
              {i + 1}. {q}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DebugPanel — floating overlay, toggled by a small button bottom-right
// ---------------------------------------------------------------------------
function DebugPanel({ debug }: { debug: PipelineDebug }) {
  const [open, setOpen] = useState(false);
  const [expandedQuery, setExpandedQuery] = useState<number | null>(null);

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-24 right-4 z-50 flex items-center gap-1.5 rounded-full bg-foreground/10 px-3 py-1.5 text-[11px] font-semibold text-foreground-secondary backdrop-blur-sm"
      >
        <Bug size={12} />
        Debug
      </button>

      {/* Full-screen overlay */}
      {open && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-background">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-[14px] font-semibold">
              Debug — {debug.totalRequests} Requests · {debug.finalCandidateCount} Kandidaten
            </span>
            <button onClick={() => setOpen(false)} className="p-1">
              <X size={18} className="text-foreground-secondary" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-8 pt-4">
            {/* Product identity */}
            {debug.productIdentity && <IdentityCard identity={debug.productIdentity} />}

            {/* Queries */}
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-foreground-tertiary">
              Queries ({debug.queries.length})
            </p>
            <div className="flex flex-col gap-2">
              {debug.queries.map((q, i) => (
                <div key={i} className="rounded-lg border border-border bg-surface-secondary px-3 py-2">
                  <button
                    onClick={() => setExpandedQuery(expandedQuery === i ? null : i)}
                    className="flex w-full items-start justify-between gap-2 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="block break-all font-mono text-[11px] text-foreground">
                        {q.query}
                      </span>
                      <span className="mt-0.5 block text-[10px] text-foreground-tertiary">
                        {q.engine} · {q.rawCount} roh · {q.pricedCount} mit Preis · {q.withLinkCount} mit Link · {q.passedCount} nach Filter
                      </span>
                    </div>
                    <span className={`ml-2 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${q.passedCount > 0 ? "bg-green-500/15 text-green-600" : "bg-red-500/15 text-red-500"}`}>
                      {q.passedCount > 0 ? `+${q.passedCount}` : "0"}
                    </span>
                  </button>

                  {expandedQuery === i && q.rejectedItems.length > 0 && (
                    <div className="mt-2 border-t border-border pt-2">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-foreground-tertiary">
                        Verworfen ({q.rejectedItems.length})
                      </p>
                      {q.rejectedItems.map((item, j) => (
                        <div key={j} className="flex items-start gap-1.5 py-0.5">
                          <span className="mt-0.5 shrink-0 rounded bg-red-500/10 px-1 py-px font-mono text-[9px] text-red-500">
                            {item.reason}
                          </span>
                          <span className="min-w-0 break-all font-mono text-[10px] text-foreground-secondary">
                            {item.title} <span className="text-foreground-tertiary">@ {item.source}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Final products */}
            {debug.finalProducts.length > 0 && (
              <div className="mt-6">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-foreground-tertiary">
                  Finale Kandidaten ({debug.finalProducts.length})
                </p>
                {debug.finalProducts.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 border-b border-border/50 py-1.5">
                    <span className="w-5 shrink-0 text-right font-mono text-[10px] text-foreground-tertiary">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-foreground">
                      {p.title}
                    </span>
                    <span className="shrink-0 text-[10px] text-foreground-tertiary">{p.store}</span>
                    <span className="shrink-0 font-mono text-[10px] font-bold text-foreground">
                      {formatPrice(p.price)}
                    </span>
                    {p.link && (
                      <a
                        href={p.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0"
                        onClick={(e) => { e.stopPropagation(); window.open(p.link!, "_blank", "noopener"); }}
                      >
                        <ExternalLink size={10} className="text-foreground-tertiary" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Role meta
// ---------------------------------------------------------------------------
const roleMeta: Partial<Record<StoredAlternative["role"], { label: string; icon: typeof Star }>> = {
  best: { label: "Beste Alternative", icon: Star },
  cheapest: { label: "Günstigste Alternative", icon: Tag },
  premium: { label: "Premium Alternative", icon: Gem },
};

const ROLE_PRIORITY: Record<StoredAlternative["role"], number> = {
  best: 0, cheapest: 1, premium: 2, other: 3,
};

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------
export default function AnalyseClient({ id }: { id: string }) {
  const router = useRouter();
  const [analysis, setAnalysis] = useState<StoredAnalysis | null | undefined>(undefined);
  const [debugData, setDebugData] = useState<PipelineDebug | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing with localStorage, a client-only external system
    setAnalysis(getAnalysisById(id) ?? null);
    setDebugData(getDebugData());
  }, [id]);

  if (analysis === undefined) return null;

  if (analysis === null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-10 text-center">
        <p className="font-serif text-[20px] font-medium">Analyse nicht gefunden.</p>
        <Button href="/shot" variant="primary" size="md">
          Neu scannen
        </Button>
      </div>
    );
  }

  const { name, brand, confidence, category, original, alternatives, matchQuality } = analysis;
  const isExact = matchQuality === "exact";

  // Show all alternatives with links, sorted by role priority
  const sortedAlternatives = [...alternatives]
    .filter((alt) => Boolean(alt.link?.trim()))
    .sort((a, b) => ROLE_PRIORITY[a.role] - ROLE_PRIORITY[b.role]);

  return (
    <div className="flex min-h-screen flex-col safe-top">
      <header className="flex items-center gap-3 px-4 pt-4">
        <IconButton onClick={() => router.back()}>
          <ArrowLeft size={18} />
        </IconButton>
        <h1 className="text-[17px] font-bold tracking-tight">Ergebnis</h1>
      </header>

      <div className="flex-1 px-5 pb-32 pt-5">
        {/* ---- Product hero ---- */}
        <div className="relative">
          <ProductThumb icon={analysis.icon} tone={analysis.tone} size="xl" src={analysis.imageUrl} />
          <div className="absolute right-3 top-3">
            <Badge tone="match">
              <Sparkle size={11} strokeWidth={2} />
              {confidence}%
            </Badge>
          </div>
        </div>

        <div className="mt-5">
          <Badge tone="neutral">{category}</Badge>
          <h2 className="mt-2 line-clamp-2 font-serif text-[28px] font-medium leading-8 tracking-tight">
            {name}
          </h2>
          <p className="mt-0.5 truncate text-[15px] text-foreground-secondary">{brand}</p>
          <p className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-match-fg">
            <ShieldCheck size={14} strokeWidth={2} />
            Vertrauensscore {confidence}%
          </p>
        </div>

        {/* ---- Original / Ähnliches Produkt ---- */}
        <h3 className="mt-7 px-0.5 text-[13px] font-semibold uppercase tracking-wide text-foreground-tertiary">
          {isExact ? "Original" : "Ähnliches Produkt"}
        </h3>
        {!isExact && (
          <p className="mt-1 px-0.5 text-[12px] text-foreground-tertiary">
            Exaktes Produkt nicht gefunden – ähnliche EU-Angebote
          </p>
        )}

        <CardLink
          url={original.link}
          debugTitle={name}
          debugShop={original.store}
          className="mt-2.5"
        >
          <Card className="flex items-center gap-4 p-4">
            <ProductThumb
              icon={analysis.icon}
              tone={analysis.tone}
              size="md"
              src={analysis.imageUrl}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold">{original.store}</p>
              <p className="text-[16px] font-bold tracking-tight">
                {formatPrice(original.price)}
              </p>
            </div>
            {original.link && (
              <span className="flex shrink-0 items-center gap-1 text-[13px] font-medium text-foreground-secondary">
                <ExternalLink size={14} />
                Shop
              </span>
            )}
          </Card>
        </CardLink>

        {/* ---- Alternativen ---- */}
        <div className="mt-7 flex items-center justify-between px-0.5">
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-foreground-tertiary">
            Alternativen
          </h3>
          <span className="text-[12px] font-medium text-foreground-tertiary">
            {sortedAlternatives.length} gefunden
          </span>
        </div>

        <div className="mt-2.5 flex flex-col gap-3">
          {sortedAlternatives.map((alt, idx) => {
            const meta = roleMeta[alt.role];
            const RoleIcon = meta?.icon;

            return (
              <CardLink
                key={`${alt.role}-${idx}`}
                url={alt.link}
                debugTitle={alt.name}
                debugShop={alt.store}
              >
                <Card
                  className={
                    alt.role === "best"
                      ? "border-accent-strong/40 bg-accent-soft/30 p-4"
                      : "p-4"
                  }
                >
                  {meta && RoleIcon && (
                    <div className="mb-3 inline-flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-accent-strong">
                      <RoleIcon size={13} strokeWidth={2} />
                      {meta.label}
                      {alt.link && <ExternalLink size={11} className="ml-0.5 opacity-50" />}
                    </div>
                  )}
                  <div className="flex items-center gap-4">
                    <ProductThumb
                      icon={analysis.icon}
                      tone={alt.role === "best" ? analysis.tone : analysis.tone + 2}
                      size="md"
                      src={alt.imageUrl}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold">{alt.name}</p>
                      <p className="truncate text-[13px] text-foreground-secondary">{alt.store}</p>
                      {alt.shipsFromNonEU && (
                        <p className="mt-0.5 text-[11px] text-foreground-tertiary">
                          Versand ggf. aus Nicht-EU
                        </p>
                      )}
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
              </CardLink>
            );
          })}
        </div>

        {/* ---- Debug panel (temporary — remove after testing) ---- */}
        {debugData && <DebugPanel debug={debugData} />}
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
