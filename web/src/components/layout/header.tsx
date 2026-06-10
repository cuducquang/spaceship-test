"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
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
  const router = useRouter();
  const navRef = useRef<HTMLElement>(null);
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);

  const isActive = useCallback(
    (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href)),
    [pathname],
  );

  /* sliding indicator follows the active tab */
  useEffect(() => {
    const update = () => {
      const el = navRef.current?.querySelector<HTMLElement>('[data-active="true"]');
      if (el) setPill({ x: el.offsetLeft, w: el.offsetWidth });
    };
    update();
    const t = setTimeout(update, 120); // after fonts settle
    window.addEventListener("resize", update);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", update);
    };
  }, [pathname]);

  return (
    <header className="chrome-dark z-40 flex h-14 shrink-0 items-center gap-6 border-b border-white/10 px-4">
      {/* brand */}
      <Link href="/" className="group flex items-center gap-2.5">
        <div className="relative flex h-8.5 w-8.5 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 shadow-[0_0_18px_rgba(52,211,153,0.35)] transition-shadow group-hover:shadow-[0_0_26px_rgba(52,211,153,0.55)]">
          <Rocket size={16} className="text-navy" strokeWidth={2.4} />
        </div>
        <div className="leading-none">
          <div className="font-display text-[15px] font-bold tracking-tight text-white">
            Spaceship
          </div>
          <div className="mt-0.5 text-[8.5px] font-bold uppercase tracking-[0.18em] text-emerald-300/90">
            Logistics Analytics
          </div>
        </div>
      </Link>

      {/* tabs with sliding indicator */}
      <nav ref={navRef} className="relative flex items-center gap-1">
        {pill && (
          <span
            aria-hidden
            className="glow-pill absolute top-1/2 h-9 -translate-y-1/2 rounded-full transition-[transform,width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ transform: `translateX(${pill.x}px) translateY(-50%)`, width: pill.w }}
          />
        )}
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              data-active={active}
              className={cn(
                "relative z-10 flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition-colors duration-200",
                active ? "text-emerald-200" : "text-white/55 hover:text-white/90",
              )}
            >
              <Icon size={14} strokeWidth={2.2} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="flex-1" />

      {/* live cluster */}
      <div className="hidden items-center gap-3 md:flex">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-white/60">
          <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
          Live
        </span>
        <span className="h-4 w-px bg-white/10" />
        <span className="font-mono text-[10.5px] text-white/45">2025 dataset · 400 orders</span>
        <button
          onClick={() => router.push("/chat")}
          className="flex h-8 items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 text-[12px] font-semibold text-emerald-200 transition-all hover:border-emerald-300/60 hover:bg-emerald-400/20 hover:shadow-[0_0_16px_rgba(52,211,153,0.25)]"
        >
          <Sparkles size={12} />
          Ask AI
        </button>
      </div>
    </header>
  );
}
