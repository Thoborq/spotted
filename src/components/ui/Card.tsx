import type { HTMLAttributes, ReactNode } from "react";

export default function Card({
  className = "",
  children,
  ...props
}: { className?: string; children: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-3xl bg-surface border border-border shadow-card ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
