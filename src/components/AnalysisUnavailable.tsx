import Button from "@/components/ui/Button";
import type { AnalysisOutcome } from "@/lib/use-analysis-flow";

const COPY: Record<AnalysisOutcome, { title: string; subtitle: string }> = {
  not_configured: {
    title: "Echte Suche noch nicht aktiviert",
    subtitle: "Die Produkterkennung ist noch nicht eingerichtet.",
  },
  failed: {
    title: "Kein Ergebnis gefunden",
    subtitle: "Versuche es mit einem anderen Foto oder einem deutlicheren Ausschnitt.",
  },
  no_eu_shop: {
    title: "Kein EU-Shop gefunden",
    subtitle: "Momentan kein seriöser EU-Shop für dieses Produkt verfügbar.",
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

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-background px-10 text-center">
      <p className="font-serif text-[20px] font-medium">{copy.title}</p>
      <p className="text-[14px] text-foreground-secondary">{copy.subtitle}</p>
      <Button variant="primary" size="md" onClick={onDismiss}>
        Zurück
      </Button>
    </div>
  );
}
