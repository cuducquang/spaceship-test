"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpenText,
  FlaskConical,
  LayoutDashboard,
  Rocket,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/chat", label: "AI Analyst", icon: Sparkles },
  { href: "/forecast", label: "Forecast", icon: TrendingUp },
  { href: "/lab", label: "ML Lab", icon: FlaskConical },
  { href: "/knowledge", label: "Knowledge", icon: BookOpenText },
];

export function Header() {
  const pathname = usePathname();

  return (
    <header className="z-40 flex h-14 shrink-0 items-center gap-6 border-b border-border bg-panel/80 px-4 backdrop-blur-md">
      {/* brand */}
      <Link href="/" className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 shadow-md shadow-emerald-500/25">
          <Rocket size={15} className="text-navy" strokeWidth={2.4} />
        </div>
        <div className="leading-none">
          <div className="font-display text-[15px] font-bold tracking-tight text-ink">
            Spaceship
          </div>
          <div className="text-[8.5px] font-bold uppercase tracking-[0.16em] text-brand">
            Logistics Analytics
          </div>
        </div>
      </Link>

      {/* tabs */}
      <nav className="flex items-center gap-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition-all",
                active
                  ? "bg-navy text-white shadow-md shadow-navy/20"
                  : "text-ink-2 hover:bg-panel-2 hover:text-ink",
              )}
            >
              <Icon size={14} strokeWidth={2.2} className={active ? "text-emerald-300" : ""} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="flex-1" />

      <span className="tag hidden md:inline-flex">
        <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-emerald-500" />
        dataset 2025
      </span>
    </header>
  );
}
