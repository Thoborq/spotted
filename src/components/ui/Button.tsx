import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";

type Variant = "primary" | "secondary" | "ghost" | "text";
type Size = "lg" | "md" | "sm";

const variantClasses: Record<Variant, string> = {
  primary: "bg-foreground text-background hover:bg-foreground/90",
  secondary:
    "bg-accent text-accent-foreground hover:bg-accent-strong shadow-soft",
  ghost: "bg-surface text-foreground border border-border hover:bg-surface-secondary",
  text: "bg-transparent text-foreground-secondary hover:text-foreground",
};

const sizeClasses: Record<Size, string> = {
  lg: "h-14 px-6 text-[17px]",
  md: "h-12 px-5 text-[15px]",
  sm: "h-9 px-4 text-[13px]",
};

function buttonClasses(variant: Variant, size: Size, className: string) {
  return `tap-scale inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-colors disabled:opacity-40 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`;
}

type SharedProps = {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
};

export default function Button({
  variant = "primary",
  size = "lg",
  className = "",
  href,
  children,
  ...props
}: SharedProps &
  ({ href: string } | { href?: undefined }) &
  ButtonHTMLAttributes<HTMLButtonElement>) {
  if (href) {
    const isExternal = href.startsWith("http://") || href.startsWith("https://");
    if (isExternal) {
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className={buttonClasses(variant, size, className)}>
          {children}
        </a>
      );
    }
    return (
      <Link href={href} className={buttonClasses(variant, size, className)}>
        {children}
      </Link>
    );
  }

  return (
    <button
      className={buttonClasses(variant, size, className)}
      {...props}
    >
      {children}
    </button>
  );
}
