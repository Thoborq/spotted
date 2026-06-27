import Button from "@/components/ui/Button";
import type { AnalysisOutcome } from "@/lib/use-analysis-flow";

const COPY: Record<AnalysisOutcome, { title: string; subtitle: string }> = {
  not_configured: {
    title: "Echte Suche noch nicht aktiviert",
    subtitle: "Die Produkterkennung ist noch nicht eingerichtet.",
  },
  failed: {
    title: "Kein passendes Produkt gefunden",
    subtitle: "Wir haben noch kein gutes EU-Angebot für dieses Produkt gefunden.",
  },
  no_eu_shop: {
    title: "Kein passendes EU-Angebot gefunden",
    subtitle: "Wir haben noch kein gutes EU-Angebot für dieses Produkt gefunden.",
  },
};

export default function AnalysisUnavailable({
  outcome,
  onDismiss,
}: {
  outcome: AnalysisOutcome;
  onDismiss: () => void;
}) {
  const copy = COPY[outcome];
  const showRetry = outcome === "failed" || outcome === "no_eu_shop";

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-background px-10 text-center">
      <p className="font-serif text-[20px] font-medium">{copy.title}</p>
      <p className="text-[14px] text-foreground-secondary">{copy.subtitle}</p>
      <div className="mt-2 flex flex-col gap-2.5 self-stretch">
        {showRetry && (
          <Button href="/shot" variant="primary" size="md">
            Erneut mit anderem Bild versuchen
          </Button>
        )}
        <Button variant={showRetry ? "text" : "primary"} size="md" onClick={onDismiss}>
          Zurück
        </Button>
      </div>
    </div>
  );
}
