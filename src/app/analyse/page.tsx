import { ArrowLeft, ExternalLink } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import IconButton from "@/components/ui/IconButton";
import ProductThumb from "@/components/ui/ProductThumb";
import { analyseResult } from "@/lib/dummy-data";

export default function AnalysePage() {
  const { name, brand, match, category, original, alternatives } =
    analyseResult;

  return (
    <div className="flex min-h-screen flex-col safe-top">
      <header className="flex items-center gap-3 px-4 pt-4">
        <IconButton href="/shot">
          <ArrowLeft size={18} />
        </IconButton>
        <h1 className="text-[17px] font-bold tracking-tight">Ergebnis</h1>
      </header>

      <div className="flex-1 px-5 pb-32 pt-5">
        <div className="relative">
          <ProductThumb icon={original.icon} tone={original.tone} size="xl" />
          <div className="absolute right-3 top-3">
            <Badge tone="success">{match}% Treffer</Badge>
          </div>
        </div>

        <div className="mt-5">
          <Badge tone="neutral">{category}</Badge>
          <h2 className="mt-2 text-[24px] font-bold leading-8 tracking-tight">
            {name}
          </h2>
          <p className="mt-0.5 text-[15px] text-foreground-secondary">
            {brand}
          </p>
        </div>

        <h3 className="mt-7 px-0.5 text-[13px] font-semibold uppercase tracking-wide text-foreground-tertiary">
          Original
        </h3>
        <Card className="mt-2.5 flex items-center gap-4 p-4">
          <ProductThumb icon={original.icon} tone={original.tone} size="md" />
          <div className="flex-1">
            <p className="text-[15px] font-semibold">{original.store}</p>
            <p className="text-[16px] font-bold tracking-tight">
              {original.price}
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
            {alternatives.length} gefunden
          </span>
        </div>

        <div className="mt-2.5 flex flex-col gap-3">
          {alternatives.map((alt) => (
            <Card key={alt.id} className="flex items-center gap-4 p-4">
              <ProductThumb icon={alt.icon} tone={alt.tone} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold">
                  {alt.name}
                </p>
                <p className="truncate text-[13px] text-foreground-secondary">
                  {alt.store}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[15px] font-bold tracking-tight">
                  {alt.price}
                </p>
                <p className="text-[12px] font-semibold text-[#3E6B43]">
                  {alt.diff}
                </p>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 hairline-t bg-background/85 backdrop-blur-xl safe-bottom">
        <div className="mx-auto flex max-w-md gap-3 px-5 py-4">
          <Button href="/shot" variant="ghost" size="md" className="flex-1">
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
