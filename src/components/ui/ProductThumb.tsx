"use client";

import { useState } from "react";
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

export default function ProductThumb({
  icon = "bag",
  tone = 0,
  size = "md",
  className = "",
  src,
}: {
  icon?: ProductIcon;
  tone?: number;
  size?: keyof typeof sizeClasses;
  className?: string;
  src?: string;
}) {
  const [imgError, setImgError] = useState(false);
  const showImage = Boolean(src) && !imgError;
  const Icon = icons[icon];
  const swatch = swatches[tone % swatches.length];
  const isLarge = size === "lg" || size === "xl";

  return (
    <div
      className={`fabric ${swatch} relative shrink-0 overflow-hidden ring-1 ring-inset ring-foreground/[0.06] ${sizeClasses[size]} ${className}`}
    >
      {showImage && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- SerpAPI thumbnails span many external CDN domains */}
          <img
            src={src}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            onError={() => setImgError(true)}
          />
          {isLarge && (
            <div className="absolute bottom-3 left-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-background/55 backdrop-blur-sm">
              <Icon className="text-foreground/55" strokeWidth={1.5} size={17} />
            </div>
          )}
        </>
      )}
      {!showImage && (
        <div className="flex h-full w-full items-center justify-center">
          {isLarge ? (
            <div className="absolute bottom-3 left-3 flex h-9 w-9 items-center justify-center rounded-full bg-background/55 backdrop-blur-sm">
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
      )}
    </div>
  );
}
