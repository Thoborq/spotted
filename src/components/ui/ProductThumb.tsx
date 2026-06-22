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

const gradients = [
  "from-[#EFE7D8] to-[#D7C6A5]",
  "from-[#E9E4F2] to-[#C9BEE0]",
  "from-[#E3EEEA] to-[#B9D6C9]",
  "from-[#F3E2DD] to-[#E0B4A4]",
  "from-[#E6ECF3] to-[#B9C8DE]",
];

const sizeClasses = {
  sm: "h-12 w-12 rounded-xl",
  md: "h-16 w-16 rounded-2xl",
  lg: "h-28 w-full rounded-2xl",
  xl: "aspect-square w-full rounded-3xl",
};

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

  return (
    <div
      className={`flex shrink-0 items-center justify-center bg-gradient-to-br ${gradient} ${sizeClasses[size]} ${className}`}
    >
      <Icon
        className="text-foreground/35"
        strokeWidth={1.6}
        size={size === "lg" || size === "xl" ? 32 : size === "md" ? 22 : 18}
      />
    </div>
  );
}
