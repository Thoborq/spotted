"use client";

import { useState } from "react";
import { Bug, ChevronDown, ExternalLink, X } from "lucide-react";
import { formatPrice } from "@/lib/format";
import type { PipelineDebug, ProductIdentityDebug, QueryDebug } from "@/lib/analysis-types";

// ---------------------------------------------------------------------------
// IdentityCard
// ---------------------------------------------------------------------------
function IdentityCard({ identity }: { identity: ProductIdentityDebug }) {
  const conf = identity.confidence;
  const confColor = conf >= 90 ? "text-green-600" : conf >= 70 ? "text-yellow-600" : "text-red-500";

  return (
    <div className="mb-4 rounded-lg border border-border bg-background p-3">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-foreground-tertiary">
        Erkannte Produktidentität
      </p>
      <div className="flex items-baseline gap-2">
        <span className="text-[14px] font-bold text-foreground">
          {identity.brand}{identity.model ? ` ${identity.model}` : ""}
          {!identity.brand && !identity.model ? identity.productType : ""}
        </span>
        <span className={`text-[12px] font-semibold ${confColor}`}>{conf}% Konfidenz</span>
      </div>
      {identity.productType && (identity.brand || identity.model) && (
        <p className="text-[11px] text-foreground-secondary">{identity.productType}</p>
      )}
      <div className="mt-2 rounded bg-surface-secondary px-2 py-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground-tertiary">Exact Query</p>
        <p className="mt-0.5 break-all font-mono text-[11px] text-foreground">
          {identity.exactProductQuery || <span className="italic text-red-500">— fehlt —</span>}
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
// QueryRawSection — request params + full response structure for one query
// ---------------------------------------------------------------------------
function QueryRawSection({ q }: { q: QueryDebug }) {
  const raw = q.raw;
  if (!raw) return <p className="mt-2 text-[10px] italic text-foreground-tertiary">Kein Raw-Debug verfügbar.</p>;

  return (
    <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
      {/* 1. Request params */}
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-foreground-tertiary">
          Request-Parameter · HTTP {raw.httpStatus}
        </p>
        <div className="rounded bg-surface-secondary px-2 py-1.5">
          {Object.entries(raw.requestParams).map(([k, v]) => (
            <div key={k} className="flex gap-2 py-px">
              <span className="w-28 shrink-0 font-mono text-[10px] text-foreground-tertiary">{k}</span>
              <span className="min-w-0 break-all font-mono text-[10px] text-foreground">{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* SerpAPI error / metadata when 0 results */}
      {raw.serpError && (
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-red-500">SerpAPI Error</p>
          <p className="break-all font-mono text-[10px] text-red-400">{raw.serpError}</p>
        </div>
      )}
      {raw.serpMetadata && (
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-foreground-tertiary">search_metadata</p>
          <pre className="overflow-x-auto rounded bg-surface-secondary px-2 py-1.5 font-mono text-[9px] text-foreground-secondary">
            {JSON.stringify(raw.serpMetadata, null, 2)}
          </pre>
        </div>
      )}
      {raw.serpSearchParameters && (
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-foreground-tertiary">search_parameters (von SerpAPI)</p>
          <pre className="overflow-x-auto rounded bg-surface-secondary px-2 py-1.5 font-mono text-[9px] text-foreground-secondary">
            {JSON.stringify(raw.serpSearchParameters, null, 2)}
          </pre>
        </div>
      )}
      {raw.serpSearchInformation && (
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-foreground-tertiary">search_information</p>
          <pre className="overflow-x-auto rounded bg-surface-secondary px-2 py-1.5 font-mono text-[9px] text-foreground-secondary">
            {JSON.stringify(raw.serpSearchInformation, null, 2)}
          </pre>
        </div>
      )}

      {/* 2. All top-level keys */}
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-foreground-tertiary">
          Response-Keys ({raw.responseKeys.length}) · gewählt: <span className="text-foreground">{raw.chosenField}</span>
        </p>
        <div className="rounded bg-surface-secondary px-2 py-1.5">
          {raw.responseKeys.map((rk) => (
            <div key={rk.key} className="flex items-baseline gap-2 py-px">
              <span className={`w-40 shrink-0 font-mono text-[10px] ${rk.key === raw.chosenField ? "font-bold text-green-600" : "text-foreground"}`}>
                {rk.key}
              </span>
              <span className="shrink-0 font-mono text-[10px] text-foreground-tertiary">{rk.type}</span>
              {rk.count !== undefined && (
                <span className={`font-mono text-[10px] font-bold ${rk.count > 0 ? "text-green-600" : "text-red-400"}`}>
                  [{rk.count}]
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 3. Sample products from each non-empty product key */}
      {raw.sampleProducts.length > 0 && (
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-foreground-tertiary">
            Erste 3 Produkte pro Feld
          </p>
          {raw.sampleProducts.map((sp) => (
            <div key={sp.field} className="mb-2">
              <p className="mb-0.5 font-mono text-[10px] font-semibold text-foreground">{sp.field} ({sp.items.length})</p>
              {sp.items.map((item, i) => (
                <pre key={i} className="mb-1 overflow-x-auto rounded bg-surface-secondary px-2 py-1 font-mono text-[9px] text-foreground-secondary">
                  {JSON.stringify(item, null, 2).slice(0, 1200)}
                </pre>
              ))}
            </div>
          ))}
        </div>
      )}

      {raw.sampleProducts.length === 0 && (
        <p className="text-[10px] italic text-red-400">
          Keine Produktdaten in irgendeinem Feld gefunden.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DebugOverlay — floating button + full-screen overlay
// ---------------------------------------------------------------------------
export default function DebugOverlay({ debug }: { debug: PipelineDebug | null }) {
  const [open, setOpen] = useState(false);
  const [expandedQuery, setExpandedQuery] = useState<number | null>(null);

  if (!debug) return null;

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => setOpen(true)}
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
              {debug.queries.length === 0 && (
                <p className="text-[12px] italic text-foreground-tertiary">Keine Queries ausgeführt.</p>
              )}
              {debug.queries.map((q, i) => (
                <div key={i} className="rounded-lg border border-border bg-surface-secondary px-3 py-2">
                  <button
                    onClick={() => setExpandedQuery(expandedQuery === i ? null : i)}
                    className="flex w-full items-start justify-between gap-2 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="block break-all font-mono text-[11px] text-foreground">{q.query}</span>
                      <span className="mt-0.5 block text-[10px] text-foreground-tertiary">
                        {q.engine} · {q.rawCount} roh · {q.pricedCount} mit Preis · {q.withLinkCount} mit Link · {q.passedCount} nach Filter
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${q.passedCount > 0 ? "bg-green-500/15 text-green-600" : "bg-red-500/15 text-red-500"}`}>
                        {q.passedCount > 0 ? `+${q.passedCount}` : "0"}
                      </span>
                      <ChevronDown size={12} className={`text-foreground-tertiary transition-transform ${expandedQuery === i ? "rotate-180" : ""}`} />
                    </div>
                  </button>

                  {expandedQuery === i && (
                    <div className="mt-2">
                      {q.rejectedItems.length > 0 && (
                        <div className="border-t border-border pt-2">
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
                      <QueryRawSection q={q} />
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
                    <span className="w-5 shrink-0 text-right font-mono text-[10px] text-foreground-tertiary">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-foreground">{p.title}</span>
                    <span className="shrink-0 text-[10px] text-foreground-tertiary">{p.store}</span>
                    <span className="shrink-0 font-mono text-[10px] font-bold text-foreground">{formatPrice(p.price)}</span>
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
