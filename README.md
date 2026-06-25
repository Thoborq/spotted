# Spotted

Foto oder Screenshot hochladen, Produkte erkennen, Originale und Alternativen finden — gebaut mit Next.js 16 (App Router, Turbopack) und Tailwind CSS v4.

## Architektur

Die App nutzt `/api/analyze`, um Fotos aus **Spot** (Galerie-Upload) und **Shot** (Kamera) zu analysieren:

1. **Echte Erkennung (Phase 6, aktiv im Code)** — `searchWithGoogleLens()` schickt das Foto an die SerpAPI Google Lens API und liefert bei ≥4 preisgelisteten visuellen Treffern ein echtes Ergebnis (Produkt, Marke, Kategorie, Preise, Alternativen). Erfordert `SERPAPI_KEY` + `BLOB_READ_WRITE_TOKEN` (siehe unten) — **aktuell in keiner Umgebung gesetzt**, siehe [`docs/serpapi-phase1-status.md`](docs/serpapi-phase1-status.md).
2. **Dummy-Fallback (Phase 3, unverändert)** — liefert kein SerpAPI-Key oder zu wenige echte Treffer, fällt die Route auf einen statischen Produktkatalog (`src/lib/catalog.ts`) zurück. Ergebnisse werden identisch in `localStorage` gespeichert und im Verlauf angezeigt — UI-seitig kein Unterschied zwischen echtem und Dummy-Ergebnis.

### `/api/analyze`

`POST /api/analyze` erwartet `multipart/form-data` mit einem Feld `image` (JPEG/PNG/WebP, max. 8 MB) und liefert ein `AnalysisResult` (siehe `src/lib/analysis-types.ts`):

```ts
type AnalysisResult = {
  originalProduct: { name: string; brand: string; store: string; price: number };
  brand: string;
  category: string;
  confidence: number;
  priceRange: { min: number; max: number };
  alternatives: {
    best: AlternativeProduct;
    cheapest: AlternativeProduct;
    premium: AlternativeProduct;
  };
};
```

Die Route orchestriert zwei Services aus `src/lib/services/`:

- **`vision-service.ts`** — erkennt Produkt, Marke und Kategorie aus dem Foto.
- **`product-search-service.ts`** — sucht Originalpreis, Preisbereich und Alternativen zum erkannten Produkt.

### Fallback-Modus

- **`SERPAPI_KEY` gesetzt + ≥4 preisgelistete Google-Lens-Treffer:** echtes Ergebnis, der Dummy-Katalog wird nicht berührt.
- **Kein Key gesetzt, API-Fehler, oder zu wenige Treffer:** automatischer Fallback auf den Dummy-Katalog — keine Fehlermeldung, keine Kosten, identisches UI.
- `vision-service.ts` (OPENAI/GEMINI/ANTHROPIC_API_KEY) bleibt bewusst auf "nicht implementiert" — kein LLM in dieser Phase, siehe [`docs/serpapi-phase1-status.md`](docs/serpapi-phase1-status.md).

Anbietervergleich, Kostenrechnung und Architekturbegründung: [`docs/technical-architecture.md`](docs/technical-architecture.md). Aktueller Integrationsstatus, Setup-Anleitung und Trefferqualität: [`docs/serpapi-phase1-status.md`](docs/serpapi-phase1-status.md).

## ENV Setup

```bash
cp .env.example .env.local
```

| Variable | Zweck | Wenn leer |
|---|---|---|
| `SERPAPI_KEY` | Produktsuche / Preisvergleich (SerpAPI Google Lens API) | `product-search-service.ts` nutzt den Dummy-Katalog |
| `OPENAI_API_KEY` | Vision-API (Produkterkennung über GPT) | `vision-service.ts` nutzt den Dummy-Katalog, sofern auch kein anderer Vision-Key gesetzt ist |
| `GEMINI_API_KEY` | Vision-API (Produkterkennung über Gemini) | s.o. |
| `ANTHROPIC_API_KEY` | Vision-API (Produkterkennung über Claude) | s.o. |

Für die UI-Flow-Entwicklung (Phase 1–3) ist **keine** der Variablen erforderlich — `.env.local` kann komplett leer bleiben.

## Lokal entwickeln

```bash
npm install
npm run dev
```

Öffne [http://localhost:3000](http://localhost:3000).

```bash
npm run build   # Production-Build (Turbopack)
npm run start   # Production-Server lokal
npm run lint     # ESLint
```

## Deployment

Das Projekt ist mit GitHub und Vercel verbunden — jeder Push auf `main` löst automatisch einen Production-Deploy aus. Keine manuelle Vercel-Konfiguration nötig.

Falls in Phase 6 echte API-Keys produktiv genutzt werden: in den Vercel-Projekteinstellungen unter **Environment Variables** dieselben Variablen wie in `.env.example` eintragen (niemals Keys committen — `.env*` ist per `.gitignore` ausgeschlossen, nur `.env.example` ist absichtlich ausgenommen).
