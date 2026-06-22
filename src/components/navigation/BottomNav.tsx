"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles, Camera, Clock, User } from "lucide-react";
import type { ComponentType } from "react";

const tabs: {
  href: string;
  label: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
}[] = [
  { href: "/spot", label: "Spot", icon: Sparkles },
  { href: "/shot", label: "Shot", icon: Camera },
  { href: "/verlauf", label: "Verlauf", icon: Clock },
  { href: "/profil", label: "Profil", icon: User },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 safe-bottom">
      <div className="hairline-t bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-md items-stretch justify-between px-2">
          {tabs.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className="tap-scale flex flex-1 flex-col items-center gap-1 py-2.5"
              >
                <Icon
                  size={24}
                  strokeWidth={active ? 2.1 : 1.7}
                  className={active ? "text-foreground" : "text-foreground-tertiary"}
                />
                <span
                  className={`text-[11px] font-medium tracking-tight ${
                    active ? "text-foreground" : "text-foreground-tertiary"
                  }`}
                >
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
