"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import {
  BookOpenText,
  FlaskConical,
  LayoutDashboard,
  LogOut,
  Menu,
  Rocket,
  Sparkles,
  TrendingUp,
  X,
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
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = useCallback(
    (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href)),
    [pathname],
  );

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    router.push("/login");
    router.refresh();
  };

  return (
    <header className="chrome-dark relative z-40 flex h-14 shrink-0 items-center gap-3 border-b border-white/10 px-3 md:gap-6 md:px-4">
      {/* mobile menu trigger */}
      <button
        onClick={() => setMenuOpen((o) => !o)}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white md:hidden"
        aria-label={menuOpen ? "Close menu" : "Open menu"}
      >
        {menuOpen ? <X size={18} /> : <Menu size={18} />}
      </button>

      {/* brand */}
      <Link href="/" className="group flex items-center gap-2.5">
        <div className="relative flex h-8.5 w-8.5 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-indigo-500 shadow-[0_0_18px_rgba(34,211,238,0.3)] transition-shadow group-hover:shadow-[0_0_26px_rgba(34,211,238,0.5)]">
          <Rocket size={16} className="text-[#0a0e16]" strokeWidth={2.4} />
        </div>
        <div className="leading-none">
          <div className="font-display text-[15px] font-bold tracking-tight text-white">
            Spaceship
          </div>
          <div className="mt-0.5 text-[8.5px] font-bold uppercase tracking-[0.18em] text-cyan-300/90">
            Logistics Analytics
          </div>
        </div>
      </Link>

      {/* tabs, the active one carries its own pill so it always wraps the label */}
      <nav className="hidden items-center gap-1 md:flex">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold transition-colors duration-200",
                active
                  ? "glow-pill"
                  : "border-transparent text-white/55 hover:bg-white/5 hover:text-white/90",
              )}
            >
              <Icon size={14} strokeWidth={2.2} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="flex-1" />

      {/* live indicator */}
      <span className="hidden items-center gap-1.5 text-[11px] font-semibold text-white/60 lg:flex">
        <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
        Live
      </span>
      <button
        onClick={() => router.push("/chat")}
        className="hidden h-8 items-center gap-1.5 rounded-full border border-indigo-400/40 bg-indigo-500/15 px-3 text-[12px] font-semibold text-indigo-200 transition-all hover:border-indigo-300/70 hover:bg-indigo-500/25 hover:shadow-[0_0_16px_rgba(99,102,241,0.3)] sm:flex"
      >
        <Sparkles size={12} />
        Ask AI
      </button>
      <button
        onClick={logout}
        title="Sign out (reviewer)"
        className="flex h-8 w-8 items-center justify-center rounded-full text-white/45 transition-colors hover:bg-white/10 hover:text-white/90"
      >
        <LogOut size={14} />
      </button>

      {/* mobile nav sheet */}
      {menuOpen && (
        <div className="absolute inset-x-0 top-full z-50 border-b border-white/10 bg-[#0a0e16]/95 px-3 py-3 shadow-[0_24px_48px_rgba(0,0,0,0.6)] backdrop-blur-xl md:hidden">
          <nav className="grid gap-1">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3.5 py-3 text-[14px] font-semibold transition-colors",
                    active
                      ? "bg-indigo-500/20 text-indigo-200"
                      : "text-white/65 hover:bg-white/5 hover:text-white",
                  )}
                >
                  <Icon size={16} strokeWidth={2.2} />
                  {label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-2 flex items-center justify-end border-t border-white/10 px-1 pt-2.5">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-white/60">
              <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-cyan-400" />
              Live
            </span>
          </div>
        </div>
      )}
    </header>
  );
}
