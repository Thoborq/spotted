import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";

type Tone = "surface" | "accent" | "dark";

const toneClasses: Record<Tone, string> = {
  surface: "bg-surface border border-border text-foreground",
  accent: "bg-accent text-accent-foreground",
  dark: "bg-foreground text-background",
};

function iconButtonClasses(tone: Tone, className: string) {
  return `tap-scale inline-flex shrink-0 items-center justify-center rounded-full shadow-soft ${toneClasses[tone]} ${className}`;
}

type SharedProps = {
  tone?: Tone;
  size?: number;
  className?: string;
  children: ReactNode;
};

export default function IconButton({
  tone = "surface",
  size = 40,
  className = "",
  href,
  children,
  ...props
}: SharedProps &
  ({ href: string } | { href?: undefined }) &
  ButtonHTMLAttributes<HTMLButtonElement>) {
  if (href) {
    return (
      <Link
        href={href}
        style={{ width: size, height: size }}
        className={iconButtonClasses(tone, className)}
      >
        {children}
      </Link>
    );
  }

  return (
    <button
      style={{ width: size, height: size }}
      className={iconButtonClasses(tone, className)}
      {...props}
    >
      {children}
    </button>
  );
}
