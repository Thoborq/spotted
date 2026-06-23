import { ShoppingBag, Sparkles, Tag, Watch, Footprints, Shirt } from "lucide-react";

const icons = {
  bag: ShoppingBag,
  tag: Tag,
  sparkles: Sparkles,
  watch: Watch,
  shoe: Footprints,
  shirt: Shirt,
} as const;

export type ProductIcon = keyof typeof icons;

// Curated, on-brand swatch palette — warm and muted, theme-aware via CSS vars.
const swatches = ["swatch-0", "swatch-1", "swatch-2", "swatch-3", "swatch-4"];

const sizeClasses = {
  sm: "h-12 w-12 rounded-xl",
  md: "h-16 w-16 rounded-2xl",
  lg: "h-28 w-full rounded-2xl",
  xl: "aspect-square w-full rounded-3xl",
};

const chipPosition = "absolute bottom-3 left-3";

export default function ProductThumb({
  icon = "bag",
  tone = 0,
  size = "md",
  className = "",
}: {
  icon?: ProductIcon;
  tone?: number;
  size?: keyof typeof sizeClasses;
  className?: string;
}) {
  const Icon = icons[icon];
  const swatch = swatches[tone % swatches.length];
  const isLarge = size === "lg" || size === "xl";

  return (
    <div
      className={`fabric flex shrink-0 items-center justify-center ring-1 ring-inset ring-foreground/[0.06] ${swatch} ${sizeClasses[size]} ${className}`}
    >
      {isLarge ? (
        <div className={`${chipPosition} flex h-9 w-9 items-center justify-center rounded-full bg-background/55 backdrop-blur-sm`}>
          <Icon className="text-foreground/55" strokeWidth={1.5} size={17} />
        </div>
      ) : (
        <Icon
          className="text-foreground/30"
          strokeWidth={1.5}
          size={size === "md" ? 22 : 18}
        />
      )}
    </div>
  );
}
