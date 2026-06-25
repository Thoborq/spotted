# Spotted — Technische Architektur für echte Produkterkennung (Phase 4)

> **Update Phase 6:** Schritt 1 dieses Dokuments (SerpAPI Google Lens) ist
> inzwischen integriert — siehe [`docs/serpapi-phase1-status.md`](serpapi-phase1-status.md)
> für den aktuellen Stand, Setup und Grenzen. Die hier beschriebene
> LLM-Synthese-Schicht (Abschnitt 4, Schritt 2) ist weiterhin **nicht**
> gebaut — bewusste Entscheidung, SerpAPI zuerst allein zu validieren.

Status: Architekturentscheidung / Dokumentation aus Phase 4, ursprünglich geschrieben bevor Code dafür existierte. Dieses Dokument hält fest, *wie* die echte Produkterkennung aufgebaut werden soll bzw. wurde.

Ziel-Pipeline:

```
Bild hochladen → Produkt erkennen → Marke schätzen → Preisbereich bestimmen → ähnliche Produkte finden
```

---

## 1. Warum ein Vision-LLM allein nicht reicht

Vision-LLMs (GPT, Gemini, Claude) sind zuverlässig bei Aufgaben, die sich aus dem Bild selbst und ihrem trainierten Weltwissen beantworten lassen:

- Kategorie erkennen ("das ist ein Sneaker")
- Farbe, Material, Stil, grobe Designsprache beschreiben
- Sichtbare Logos/Schriftzüge lesen

Sie scheitern systematisch an allem, was **aktuelle, externe Daten** erfordert:

- **Preise.** Ein LLM hat keinen Zugriff auf den heutigen Marktpreis eines Produkts. Es kennt nur, was zum Trainingszeitpunkt irgendwo im Text stand — bei Mode-Artikeln mit häufigen Preisänderungen, Saisonkollektionen und Auslaufmodellen ist das nicht verlässlich.
- **Exakte Modellidentifikation ohne Logo.** Ohne sichtbares Markenzeichen rät das Modell anhand von Ähnlichkeit zu bekannten Produkten — das Ergebnis *klingt* plausibel, ist aber eine Vermutung, keine Erkennung.
- **Verfügbare Alternativen.** Welche Shops ein Produkt aktuell führen und zu welchem Preis, ändert sich täglich. Das ist keine Wissensfrage, sondern eine Abfrage gegen einen lebenden Datenbestand.

Das technische Risiko heißt **Halluzination**: Das Modell liefert mit hoher Selbstsicherheit eine plausible, aber falsche Zahl oder einen falschen Produktnamen. Für eine Shopping-App ist das kritischer als bei reinen Text-Anwendungen — falsche Preise und falsche Alternativen zerstören Nutzervertrauen sofort.

**Konsequenz:** Das Vision-LLM ist der richtige Baustein für Schritt 1–2 (Produkt erkennen, Marke schätzen) und für die *Synthese* der Ergebnisse, aber nicht die Quelle für Schritt 3–4 (Preisbereich, ähnliche Produkte).

---

## 2. Warum echte Produktdaten nötig sind

Für "Preisbereich bestimmen" und "ähnliche Produkte finden" braucht es eine Datenquelle, die tatsächlich gegen einen aktuellen Produkt- bzw. Bildindex sucht — nicht gegen das eingefrorene Wissen eines Sprachmodells. Zwei Wege sind dafür geeignet:

1. **Visuelle Rückwärtssuche** (z. B. SerpAPI Google Lens API): Das Foto wird direkt gegen Googles Bildindex gesucht und liefert visuell ähnliche Treffer inklusive Shopping-Angeboten mit echten, aktuellen Preisen mehrerer Händler.
2. **Textbasierte Shopping-Suche** (z. B. SerpAPI Google Shopping API): Die vom Vision-LLM extrahierten Attribute (Marke, Kategorie, Farbe, Stil) werden als Suchanfrage gegen einen Produktkatalog geschickt.

Beide liefern echte, abgleichbare Daten statt einer Schätzung. Das Vision-LLM bleibt im Spiel — aber als Synthese-Schicht, die aus den echten Rohdaten ein sauberes, der Spotted-Optik entsprechendes Ergebnis macht (Auswahl von Original/Beste/Günstigste/Premium-Alternative, Formulierung, Vertrauensscore), nicht als Quelle der Zahlen selbst.

---

## 3. Anbietervergleich

### Vision-LLMs (Produkterkennung + Markenschätzung)

| Anbieter | Modell | Preis je 1M Tokens (Input/Output) | Bild-Tokens (ca. 1–1,2 MP Foto) | Einschätzung |
|---|---|---|---|---|
| Google | Gemini 2.5 Flash | $0,30 / $2,50 | ~1.300 | Günstigstes brauchbares Vision-Modell, großer Kontext |
| Google | Gemini 2.5 Pro | $1,25 / $10,00 (≤200k Kontext) | ~1.300 | Nur falls Flash zu ungenau ist |
| OpenAI | GPT-5 mini | $0,25 / $2,00 | ~1.000–1.500 | Sehr günstig, gute strukturierte Ausgabe |
| OpenAI | GPT-4.1 mini | $0,40 / $1,60 | ~1.000–1.500 | Stabile Alternative |
| Anthropic | Claude Haiku 4.5 | $1,00 / $5,00 | ~1.300 (Formel ⌈w/28⌉×⌈h/28⌉, Cap 1.568) | Etwas teurer, sehr verlässliches JSON |
| Anthropic | Claude Sonnet/Opus 4.x | $3–5 / $15–25 | bis 4.784 (Opus 4.7+) | Overkill für reine Klassifikation |

Alle vier liegen pro Scan bei **$0,0015–0,005** — die Wahl des Modells ist für die Gesamtkosten nahezu irrelevant. Entscheidend ist Zuverlässigkeit bei strukturierter JSON-Ausgabe, nicht der Preis.

### Bildbasierte Produktsuche ("Google Lens"-Äquivalente)

Ein offizielles öffentliches Google-Lens-API existiert nicht. Realistische Optionen:

| Anbieter | Liefert | Preis | Status |
|---|---|---|---|
| **SerpAPI Google Lens API** | Visuelle Treffer, häufig direkt mit Shopping-Panel und Preisen mehrerer Händler | $25/Monat (1.000 Suchen) bis $275/Monat (30.000 Suchen) → $0,009–0,025/Suche | Aktiv, Self-Serve |
| **SerpAPI Google Shopping API** | Reine Preis-/Produktvergleichsdaten über Textsuche | Gleiche Preisstaffel, gemeinsamer Credit-Pool | Aktiv, Self-Serve |
| Google Cloud Vision API (Web/Logo Detection) | Seiten mit ähnlichem Bild, Logo-Erkennung | $1,50–3,50 / 1.000 Bilder | Aktiv, aber kein Preis-/Shopping-Output |
| Bing Visual Search API | — | — | Seit August 2025 abgeschaltet; Nachfolger ist ein Web-Grounding-Produkt, keine Bildsuche mehr |

### Fashion-spezifische Anbieter (Syte.ai, Vue.ai, Lykdat)

Alle drei arbeiten **Enterprise-/Quote-basiert**, es gibt keine öffentliche Self-Serve-API. Marktdaten zeigen Einstiegspreise für einzelne Module im Bereich von $30.000+. Für ein MVP wirtschaftlich nicht tragbar — relevant erst bei realen Retail-Partnerschaften oder nach Funding-Runde.

---

## 4. Empfohlene MVP-Architektur

```
Bild Upload
    │
    ▼
SerpAPI Google Lens API
    → echte visuelle Treffer + Shopping-Listings mit realen Preisen
    │
    ▼
Vision-LLM (Gemini 2.5 Flash oder GPT-5 mini)
    Input:  Originalfoto + rohe Lens-Treffer
    Output: Produktname, Marke, Kategorie, Vertrauensscore,
            Auswahl Original / Beste / Günstigste / Premium-Alternative
            aus den ECHTEN Lens-Treffern (keine Erfindung)
    │
    ▼
Spotted-Ergebnisdatenmodell (analysis-store.ts)
    → identische Struktur wie der heutige statische Katalog,
      nur mit echten Werten befüllt
```

**Warum diese Reihenfolge und nicht "LLM rät alles":** Das LLM bekommt die echten Lens-Rohdaten als Kontext und wählt/synthetisiert daraus — es erfindet keine Preise oder Produkte mehr, sondern strukturiert und formuliert auf Basis realer Treffer. Zwei API-Calls pro Scan, beide günstig.

**Bekannte Einschränkung:** Google Lens ist nicht fashion-spezialisiert. Bei generischen Fast-Fashion-Artikeln ohne Logo kann die Treffergenauigkeit schwanken. Vor einem Commitment sollte mit echten Produktfotos pilotiert werden (siehe Empfehlung in Abschnitt 7).

Das bestehende Datenmodell aus Phase 3 (`StoredAnalysis`, Original + drei Alternativ-Rollen) bleibt strukturell unverändert — nur die Werte kommen dann aus echten Daten statt dem statischen Katalog. Das vereinfacht die spätere Migration erheblich.

---

## 5. Kostenrechnung

**Annahme** (anpassbar): 4 Scans pro Nutzer und Monat (Lifestyle-App, kein Daily-Use-Case). LLM-Call ≈ 2.500 Input-/500 Output-Tokens (Foto + Lens-Rohdaten + Prompt) ≈ **$0,002/Scan** auf Gemini 2.5 Flash- bzw. GPT-5-mini-Niveau.

| Nutzer | Scans/Monat | SerpAPI-Kosten | LLM-Kosten | Gesamt/Monat | Pro Nutzer/Monat |
|---|---|---|---|---|---|
| 100 | 400 | $25 (kleinster Plan, deckt 1.000) | $0,80 | ≈ $26 | $0,26 |
| 1.000 | 4.000 | $75 (Plan für 5.000) | $8 | ≈ $83 | $0,083 |
| 10.000 | 40.000 | ≈ $360 (Schätzung — über höchster Self-Serve-Stufe) | $80 | ≈ $440 | $0,044 |
| 100.000 | 400.000 | ≈ $2.400 (Enterprise-Schätzung) | $800 | ≈ $3.200 | $0,032 |

**Einordnung:**

- Bei kleiner Nutzerzahl dominiert die **SerpAPI-Mindestplangebühr** ($25/Monat) die Kosten, nicht das LLM — bei 100 Nutzern zahlt man fast denselben Fixpreis wie bei deutlich mehr.
- Ab 10.000+ Nutzern verlässt der Bedarf den veröffentlichten Self-Serve-Bereich von SerpAPI (max. 30.000 Suchen/$275/Monat) — dort wird ein individuelles Enterprise-Angebot nötig. Die Werte in der Tabelle sind konservative Schätzungen, keine garantierten Preise.
- Die Wahl des Vision-LLM verändert die Gesamtkosten nur um Cent-Beträge — die Daten-API ist der dominante Kostenfaktor, nicht das LLM.
- Nicht enthalten: reguläre Hosting-/Storage-/CDN-Kosten für Bild-Uploads — diese fallen unabhängig von der gewählten KI-Architektur an.

---

## 6. Risiken

| Risiko | Beschreibung | Abmilderung |
|---|---|---|
| **Ungenaue Treffer** | Google Lens ist Allzweck-Bildsuche, nicht fashion-trainiert. Bei generischen Artikeln, schlechtem Foto-Ausschnitt oder seltenen/neuen Produkten können die visuellen Treffer falsch oder leer sein. | Vertrauensscore transparent anzeigen; bei niedriger Konfidenz UI-Hinweis statt falscher Sicherheit; Fallback auf "kein eindeutiges Ergebnis". |
| **Falsche Preise** | Auch echte Shopping-Daten können veraltet, regional falsch oder für Varianten (Größe/Farbe) ungenau sein. | Preise immer mit Quelle/Händler anzeigen statt als absolute Wahrheit; Disclaimer "Preis kann abweichen"; kein automatischer Checkout ohne Bestätigung beim Händler. |
| **API-Kosten** | SerpAPI ist plan-basiert, nicht linear pay-as-you-go — bei unerwartetem Nutzerwachstum können Kosten sprunghaft steigen (siehe Abschnitt 5). | Kosten-Monitoring pro Scan; Rate-Limits pro Nutzer/Tag in der App, um Missbrauch (z. B. Massen-Scans) zu verhindern. |
| **Datenschutz** | Hochgeladene Fotos können personenbezogene Daten enthalten (Gesichter, Räume, Hintergrund). Sie verlassen die App und werden an Drittanbieter (SerpAPI/Google, LLM-Anbieter) übertragen. | Klare Datenschutzerklärung vor erstem Upload; keine dauerhafte Speicherung der Rohbilder bei Drittanbietern anstreben (Anbieter-AGB prüfen); Bilder nach Verarbeitung serverseitig löschen statt dauerhaft vorzuhalten. |
| **Bildrechte** | Nutzer könnten urheberrechtlich geschützte Bilder (z. B. aus Webshops statt eigenes Foto) hochladen; die App selbst zeigt zudem ggf. Vorschaubilder/Daten Dritter (Händlerlogos, Produktnamen) an. | Nutzungsbedingungen: Hochladen nur eigener Fotos; bei Anzeige von Händlerdaten auf Quelle verlinken statt Inhalte zu kopieren; keine fremden Produktbilder dauerhaft selbst hosten. |

---

## 7. Klare Empfehlung

**Nicht** sofort eine Enterprise-Fashion-API (Syte, Vue.ai, Lykdat) integrieren. Diese sind teuer, quote-basiert und für ein unvalidiertes MVP unverhältnismäßig.

**Stattdessen, in dieser Reihenfolge:**

1. **Erst testen, nicht integrieren.** SerpAPI Google Lens API + ein günstiges Vision-Modell (Gemini 2.5 Flash oder GPT-5 mini) mit einer kleinen Menge echter Produktfotos manuell/im Skript pilotieren — Treffergenauigkeit und Preisqualität bewerten, bevor Code in die App wandert.
2. **Erst wenn die Pilotqualität überzeugt**, die Integration in `analysis-store.ts` einbauen (Backend-Proxy nötig, da SerpAPI-Keys nicht client-seitig liegen dürfen).
3. **Enterprise-Fashion-APIs erst dann evaluieren**, wenn (a) echte Nutzerzahlen/Umsatz die Kosten rechtfertigen und (b) die generische Bildsuche an Grenzen stößt, die spezialisierte Modelle nachweislich lösen.

Dieser Weg hält die Kosten in der Frühphase niedrig (siehe Abschnitt 5: ab $26/Monat bei 100 Nutzern), vermeidet eine verfrühte Bindung an teure Enterprise-Verträge und liefert trotzdem echte, nicht-halluzinierte Daten statt der aktuellen Simulation.
