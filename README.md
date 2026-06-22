# Spotted

Foto oder Screenshot hochladen, Produkte erkennen, Originale und Alternativen finden — gebaut mit Next.js 16 (App Router, Turbopack) und Tailwind CSS v4.

## Architektur

Die App hat aktuell zwei parallele, bewusst getrennte Schichten:

1. **UI-Flow (Phase 1–3, produktiv)** — `src/app/(tabs)/shot/page.tsx` simuliert den kompletten Scan-Vorgang rein client-seitig über `src/lib/analysis-store.ts` und einen statischen Produktkatalog (`src/lib/catalog.ts`). Ergebnisse werden in `localStorage` gespeichert und im Verlauf/Home-Feed angezeigt. Dieser Flow läuft vollständig ohne Backend und ohne externe API.
2. **Backend-Infrastruktur (Phase 5, vorbereitet)** — eine eigenständige `/api/analyze`-Route mit Upload-Pipeline und Service-Layer, die strukturell bereits für echte Produkterkennung vorbereitet ist, aber noch nicht in den UI-Flow eingebunden wurde. Details dazu unten und in [`docs/technical-architecture.md`](docs/technical-architecture.md).

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

Beide Services prüfen beim Aufruf, ob die jeweils nötigen API-Keys (siehe unten) gesetzt sind:

- **Kein Key gesetzt (Standardzustand):** Es wird automatisch der bestehende Dummy-Katalog verwendet — identisches Verhalten wie der bisherige Phase-3-Flow, keine externen Aufrufe, keine Kosten.
- **Key gesetzt:** Aktuell wirft der jeweilige Service bewusst einen Fehler ("... noch nicht implementiert (Phase 6)"). Es findet **kein** echter API-Call statt — das verhindert versehentliche Kosten, falls ein Key vorzeitig eingetragen wird, bevor die echte Integration steht.

Die echte Anbindung (SerpAPI Google Lens, sowie OpenAI/Gemini/Claude Vision) ist für Phase 6 vorgesehen — Begründung der Architektur, Anbietervergleich und Kostenrechnung stehen in [`docs/technical-architecture.md`](docs/technical-architecture.md).

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
