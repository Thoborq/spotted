# Spotted

Foto oder Screenshot hochladen, Produkte erkennen, Originale und Alternativen finden — gebaut mit Next.js 16 (App Router, Turbopack) und Tailwind CSS v4.

## Architektur

Die App nutzt `/api/analyze`, um Fotos aus **Spot** (Galerie-Upload) und **Shot** (Kamera) zu analysieren. Es gibt **keinen Dummy-Fallback mehr, der als echtes Ergebnis angezeigt wird** — entweder ein echter Treffer oder eine klare Information, dass es keinen gibt:

1. **Echte Erkennung** — `searchWithGoogleLens()` schickt das Foto an die SerpAPI Google Lens API und liefert bei ≥4 preisgelisteten visuellen Treffern ein echtes Ergebnis (Produkt, Marke, Kategorie, Preise, Alternativen). Erfordert `SERPAPI_KEY` + `BLOB_READ_WRITE_TOKEN` (siehe unten) — **aktuell in keiner Umgebung gesetzt**, siehe [`docs/serpapi-phase1-status.md`](docs/serpapi-phase1-status.md).
2. **Kein Key gesetzt** — Spot/Shot zeigen "Echte Suche noch nicht aktiviert" statt eines Ergebnisses.
3. **Key gesetzt, aber kein brauchbarer Treffer** (API-Fehler, zu wenige Treffer) — Spot/Shot zeigen "Kein Ergebnis gefunden".

### `/api/analyze`

`POST /api/analyze` erwartet `multipart/form-data` mit einem Feld `image` (JPEG/PNG/WebP, max. 8 MB) und liefert ein `AnalyzeResponse` (siehe `src/lib/analysis-types.ts`):

```ts
type AnalyzeResponse =
  | { status: "ok"; result: AnalysisResult }     // echter Treffer
  | { status: "not_configured" }                  // kein SERPAPI_KEY gesetzt
  | { status: "no_match" };                        // Suche lief, kein brauchbarer Treffer
```

Die Route nutzt `product-search-service.ts` → `searchWithGoogleLens()` für die echte Bildsuche. `vision-service.ts` (OPENAI/GEMINI/ANTHROPIC_API_KEY) ist bewusst nicht angebunden — kein LLM in dieser Phase, siehe [`docs/serpapi-phase1-status.md`](docs/serpapi-phase1-status.md).

Anbietervergleich, Kostenrechnung und Architekturbegründung: [`docs/technical-architecture.md`](docs/technical-architecture.md). Aktueller Integrationsstatus, Setup-Anleitung und Trefferqualität: [`docs/serpapi-phase1-status.md`](docs/serpapi-phase1-status.md).

## ENV Setup

```bash
cp .env.example .env.local
```

| Variable | Zweck | Wenn leer |
|---|---|---|
| `SERPAPI_KEY` | Produktsuche / Preisvergleich (SerpAPI Google Lens API) | Spot/Shot zeigen "Echte Suche noch nicht aktiviert" |
| `BLOB_READ_WRITE_TOKEN` | Temporäres Hosting des Fotos für SerpAPI (siehe `.env.example`) | nur relevant, sobald `SERPAPI_KEY` gesetzt ist |
| `OPENAI_API_KEY` / `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` | Reserviert für eine spätere Phase, aktuell nicht angebunden | ohne Wirkung |

Ohne `SERPAPI_KEY` kann die App weiterhin gestartet und durchgeklickt werden — Spot/Shot zeigen dann konsequent "Echte Suche noch nicht aktiviert" statt eines Ergebnisses.

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
