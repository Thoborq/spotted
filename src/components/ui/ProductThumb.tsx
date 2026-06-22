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

// Curated, on-brand swatch palette — warm and muted, no saturated hues.
const gradients = [
  "from-[#F1E8D8] to-[#D7C6A5]", // sand
  "from-[#ECE1D3] to-[#C5A47E]", // clay
  "from-[#E8ECE2] to-[#B7C4A8]", // sage
  "from-[#F1E3DD] to-[#D9B3A6]", // dusty rose
  "from-[#EAE7DF] to-[#C2BAA9]", // stone
];

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
  const gradient = gradients[tone % gradients.length];
  const isLarge = size === "lg" || size === "xl";

  return (
    <div
      className={`fabric flex shrink-0 items-center justify-center bg-gradient-to-br ring-1 ring-inset ring-black/[0.06] ${gradient} ${sizeClasses[size]} ${className}`}
    >
      {isLarge ? (
        <div className={`${chipPosition} flex h-9 w-9 items-center justify-center rounded-full bg-white/45 backdrop-blur-sm`}>
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
