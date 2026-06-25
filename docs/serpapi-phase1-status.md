# Spotted — Phase 1: SerpAPI Google Lens (Status)

Stand: Phase 1 abgeschlossen — echte Produkterkennung ist **im Code vollständig
integriert**, aber **noch nicht live**, weil in keiner Umgebung (lokal oder
Vercel-Produktion) die nötigen Keys gesetzt sind. Dieses Dokument ersetzt für
die SerpAPI-Phase die "noch nicht implementiert"-Hinweise in
[`docs/technical-architecture.md`](technical-architecture.md) — die dort
beschriebene LLM-Synthese-Schicht (Schritt 2) ist weiterhin **nicht** gebaut,
das ist mit Absicht: diese Phase ist bewusst SerpAPI pur, kein GPT/Gemini/Claude.

---

## 1. Was tatsächlich integriert ist

Die Pipeline existierte als Code bereits aus einer früheren Phase
(`4e14d5c`) — diese Iteration hat sie **gehärtet, nicht neu gebaut**:

```
Foto (Spot-Galerie oder Shot-Kamera)
    │
    ▼
POST /api/analyze  (src/app/api/analyze/route.ts)
    │
    ▼
searchWithGoogleLens()  (src/lib/services/product-search-service.ts)
    1. Foto kurz über Vercel Blob hochladen (öffentliche URL nötig für SerpAPI)
    2. SerpAPI engine=google_lens mit dieser URL aufrufen
    3. Blob sofort wieder löschen (auch bei Fehler, via finally)
    4. visual_matches mit Preis filtern, mind. 4 nötig
    │
    ├─ ≥4 preisgelistete Treffer ─→ ECHTES Ergebnis zurückgeben
    │                                (kein Dummy-Code wird mehr berührt)
    │
    └─ <4 Treffer / kein Key / API-Fehler ─→ null
         │
         ▼
       Dummy-Katalog-Fallback (catalog.ts, unverändert aus Phase 3)
```

**Wenn SerpAPI ≥4 preisgelistete visuelle Treffer liefert, werden NIE wieder
Dummy-Daten angezeigt** — der Fallback-Code wird in diesem Fall überhaupt
nicht ausgeführt (`if (liveResult) return NextResponse.json(liveResult);` in
`route.ts`, vor jedem Dummy-Aufruf).

### Was aus den echten Treffern abgeleitet wird

Google Lens liefert pro `visual_match` nur `title`, `source` (Händlername),
`link` und optional `price` — **keine** strukturierte Marke oder Kategorie.
Diese Iteration hat dafür Heuristiken ergänzt:

| Feld | Herkunft |
|---|---|
| Produktname | `title` des relevantesten Treffers (erster Treffer = höchste visuelle Ähnlichkeit laut Lens) |
| Marke | Abgleich gegen eine kuratierte Liste ~45 bekannter Mode-/Lifestyle-Marken irgendwo im Titel; ohne Treffer: erstes Wort des Titels |
| Kategorie | Keyword-Heuristik auf dem Titel (Schuhe/Hose/Hoodie/Shirt/Jacke/Uhr/Tasche/Gürtel/Brille/Kleid), sonst "Produkt" |
| Preis / Preisbereich | `price.extracted_value`, min/max über alle preisgelisteten Treffer |
| Alternativen (Beste/Günstigste/Premium) | aus den preisgelisteten Treffern **außer** dem als "Original" gewählten — verhindert, dass Original und eine Alternative identisch sind |
| Vertrauensscore | `min(95, 50 + Anzahl preisgelisteter Treffer × 5)` |

Beide Heuristiken (Marke, Kategorie) wurden gegen mehrere gemockte
SerpAPI-Antworten geprüft, u.a. exakt das Beispiel aus dem Bug-Report
("Adidas-Hose" → erkennt jetzt Marke "Adidas Originals", Kategorie "Hose"
statt eines zufälligen Dummy-Produkts). Ein echter Live-Test mit einem
SerpAPI-Key steht noch aus (siehe Abschnitt 3).

### Korrigierter Bug seit der letzten Iteration

Der erste Entwurf dieser Iteration wählte "Beste Alternative" als
Median-Preis aus **allen** Treffern inklusive des als Original gewählten —
dadurch konnten Original und eine Alternative exakt derselbe Treffer sein.
Behoben: Alternativen kommen jetzt ausschließlich aus den Treffern *nach*
dem Original. Deshalb auch die Mindestanzahl auf 4 (statt 3) erhöht: 1
Original + 3 voneinander verschiedene Alternativen.

---

## 2. ENV-Variablen, die gesetzt werden müssen

Aktuell **lokal und in Vercel-Produktion: keine der beiden Variablen
gesetzt** (verifiziert via `vercel env ls` → "No Environment Variables
found"). Das ist der alleinige Grund, warum bisher jeder Scan auf den
Dummy-Katalog zurückfällt — nicht ein Fehler im Code.

| Variable | Wie bekommen | Pflicht für echte Erkennung |
|---|---|---|
| `SERPAPI_KEY` | Account auf [serpapi.com](https://serpapi.com) anlegen → Dashboard → API Key kopieren | Ja |
| `BLOB_READ_WRITE_TOKEN` | Vercel-Dashboard → Projekt "spotted" → Storage → Blob-Store anlegen → wird **automatisch** als Env-Var verknüpft, kein manuelles Kopieren nötig | Ja, sobald `SERPAPI_KEY` gesetzt ist |

**Lokal testen:** `.env.example` nach `.env.local` kopieren, beide Werte
eintragen (`BLOB_READ_WRITE_TOKEN` per `vercel env pull .env.local`, falls
der Blob-Store bereits in Vercel existiert), `npm run dev`.

**Produktion (Vercel):** Projekteinstellungen → Environment Variables →
`SERPAPI_KEY` einfügen; Blob-Store unter Storage anlegen (Token folgt
automatisch). Kein Redeploy nötig für Env-Var-Änderungen bei
Serverless-Functions in den meisten Fällen, ein manueller Redeploy stellt es
aber sicher.

---

## 3. Wie der erste echte Test funktioniert

1. Beide Variablen wie oben setzen (lokal oder in Vercel).
2. App öffnen → **Spot** (Bild aus Galerie) oder **Shot** (Kamera) verwenden,
   ein reales Produktfoto mit sichtbarem Logo/Schriftzug funktioniert am
   verlässlichsten (siehe Abschnitt 6).
3. Im Vercel-Dashboard unter **Deployments → Functions → Logs** (oder lokal
   im Terminal bei `npm run dev`) erscheint einer von zwei Log-Einträgen:
   - `[searchWithGoogleLens] Live-Treffer: "..."` → echter Treffer, Dummy
     wurde nicht verwendet.
   - `[searchWithGoogleLens] Zu wenige preisgelistete Treffer (...)` bzw.
     `[/api/analyze] Kein Live-Ergebnis von SerpAPI - verwende
     Dummy-Katalog-Fallback.` → SerpAPI hat zu wenig/nichts gefunden, App
     zeigt bewusst den Dummy-Katalog statt eines leeren Ergebnisses.
4. Das Ergebnis erscheint im bestehenden Analyse-Screen — unverändertes
   Layout, nur mit echten Werten befüllt.

---

## 4. Kosten pro Scan (verifiziert, Stand heute von serpapi.com/pricing)

Jeder Scan = **genau ein** SerpAPI-Suchaufruf (`engine=google_lens`).
Vercel-Blob-Kosten für die paar Sekunden Zwischenspeicherung sind bei
diesem Volumen im Vercel-Free/Pro-Kontingent vernachlässigbar.

| Plan | Preis/Monat | Suchen/Monat | Kosten pro Scan |
|---|---|---|---|
| Free | $0 | 250 | $0 (innerhalb des Kontingents) |
| Starter | $25 | 1.000 | $0,025 |
| Developer | $75 | 5.000 | $0,015 |
| Production | $150 | 15.000 | $0,010 |
| Big Data | $275 | 30.000 | $0,00917 |
| Enterprise | individuell | individuell | — |

Wie in `technical-architecture.md` Abschnitt 5 beschrieben: bei kleiner
Nutzerzahl dominiert die **Mindestplangebühr**, nicht die Kosten pro Scan.
Für einen ersten Test reicht der **Free-Plan (250 Suchen/Monat, $0)** völlig
aus.

Nicht in dieser Phase enthalten (bewusst, siehe Auftrag): keine
GPT/Gemini/Claude-Kosten, da kein LLM verwendet wird.

---

## 5. Bekannte Grenzen

- **Kein Live-Test mit echtem Key bisher durchgeführt.** Alles oben zur
  Treffer-Logik wurde gegen gemockte SerpAPI-Antworten verifiziert (Format
  laut offizieller SerpAPI-Dokumentation), nicht gegen echte Google-Lens-
  Ergebnisse. Erst der erste reale Scan (Abschnitt 3) zeigt, ob die
  Heuristiken in der Praxis taugen.
- **Titel können unsauber sein.** Google-Lens-Titel sind gescrapte
  Seitentitel und enthalten manchmal Größen-/Farbangaben oder Shop-Namen.
  Es gibt bewusst **keine** Bereinigungs-Heuristik dafür (ein erster Versuch
  mit einem Trennzeichen-Schnitt hätte im Test die Marke mit abgeschnitten
  und wurde wieder entfernt) — sauberes Umformulieren bräuchte ein LLM, was
  in Phase 1 explizit nicht gebaut werden soll.
- **Marke/Kategorie sind Heuristiken, keine echte Erkennung.** Die
  Markenliste deckt ~45 bekannte Mode-/Lifestyle-Marken ab; alles andere
  fällt auf "erstes Wort des Titels" zurück, was bei unglücklicher
  Wortstellung falsch sein kann.
- **Mindestens 4 preisgelistete Treffer nötig.** Seltene, sehr neue oder
  generische No-Name-Produkte liefern oft weniger — App zeigt dann bewusst
  den Dummy-Katalog statt eines dünnen/unsicheren echten Ergebnisses.
- **SerpAPI-Plan ist stufenbasiert, nicht linear.** Bei Wachstum über
  30.000 Suchen/Monat hinaus ist ein individuelles Enterprise-Gespräch
  nötig (siehe `technical-architecture.md`).

## 6. Welche Produktarten voraussichtlich gut/schlecht funktionieren

Basierend auf der dokumentierten Funktionsweise von Google Lens (visuelle
Rückwärtssuche gegen Googles Bildindex) — **noch nicht an echten Scans
verifiziert**:

**Voraussichtlich gut:**
- Markenschuhe/Sneaker mit sichtbarem Logo (Nike, Adidas, New Balance etc.)
- Uhren bekannter Marken
- Taschen/Accessoires mit sichtbarem Markenschriftzug
- Aktuelle, weit verbreitete Produkte mit großer Online-Präsenz

**Voraussichtlich schwach:**
- Generische Basics ohne Logo (einfarbiges T-Shirt, No-Name-Hose)
- Eigenmarken kleiner/lokaler Shops ohne große Online-Präsenz
- Stark beschnittene, unscharfe oder schlecht beleuchtete Fotos
- Auslaufmodelle/alte Kollektionen, die nicht mehr aktiv gelistet sind
- Produkte mit wenigen verschiedenen Preisangeboten (< 4 zwingt in den Dummy-Fallback)

Diese Einschätzung muss nach den ersten echten Tests (Abschnitt 3) durch
beobachtete Ergebnisse ersetzt werden.

---

## 7. Sind Dummy-Daten vollständig ersetzt?

**Code-seitig: ja, mit Absicht beibehaltenem Fallback.** Sobald SerpAPI
einen brauchbaren Treffer liefert, wird der Dummy-Pfad nicht mehr erreicht
— kein Mischen von echten und erfundenen Daten in einem Ergebnis. Der
Dummy-Katalog bleibt **bewusst** als Fallback bestehen für: keinen Key,
SerpAPI-Ausfall, oder zu wenige Treffer — damit ein Scan nie mit einer
Fehlermeldung statt einem Ergebnis endet.

**Praktisch: noch nicht**, weil aktuell nirgends ein `SERPAPI_KEY` gesetzt
ist — jeder Scan läuft heute zwangsläufig über den Fallback. Das ändert
sich, sobald die Variablen aus Abschnitt 2 gesetzt sind.
