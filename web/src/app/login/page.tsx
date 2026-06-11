"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  BrainCircuit,
  Database,
  KeyRound,
  Loader2,
  LockKeyhole,
  Rocket,
  Sparkles,
  TrendingUp,
  User,
} from "lucide-react";
const FEED = [
  { icon: Database, text: "400 orders · Jan → Dec 2025 · read only" },
  { icon: BrainCircuit, text: "AI routes · validated tools compute" },
  { icon: TrendingUp, text: "backtested forecasts · 95% service level" },
];

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Sign-in failed");
      const next = params.get("next");
      router.replace(next && next.startsWith("/") ? next : "/");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="w-full max-w-sm">
      <div className="mb-7 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-indigo-500 shadow-[0_0_24px_rgba(34,211,238,0.35)]">
          <Rocket size={18} className="text-[#0a0e16]" strokeWidth={2.4} />
        </div>
        <div>
          <div className="font-display text-[17px] font-bold tracking-tight text-ink">
            Spaceship
          </div>
          <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-cyan">
            Logistics Analytics
          </div>
        </div>
      </div>

      <h1 className="font-display text-[26px] font-bold leading-tight tracking-tight text-ink">
        Enter the control room
      </h1>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">
        Sign in to the analytics workspace: dashboards, the Atlas AI analyst, forecasting and
        the ML lab.
      </p>

      <label className="mt-7 block">
        <span className="stat-label">Username</span>
        <div className="group relative mt-1.5">
          <User
            size={14}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3 transition-colors group-focus-within:text-brand"
          />
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            placeholder="reviewer"
            className="h-11 w-full rounded-xl border border-border bg-panel pl-9.5 pr-3.5 text-[14px] text-ink outline-none transition-all placeholder:text-ink-3/70 hover:border-border-2 focus:border-brand-2 focus:ring-4 focus:ring-brand-2/15"
          />
        </div>
      </label>

      <label className="mt-4 block">
        <span className="stat-label">Password</span>
        <div className="group relative mt-1.5">
          <KeyRound
            size={14}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3 transition-colors group-focus-within:text-brand"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="••••••••••••"
            className="h-11 w-full rounded-xl border border-border bg-panel pl-9.5 pr-3.5 text-[14px] text-ink outline-none transition-all placeholder:text-ink-3/70 hover:border-border-2 focus:border-brand-2 focus:ring-4 focus:ring-brand-2/15"
          />
        </div>
      </label>

      {error && (
        <p className="fade-up mt-3.5 flex items-start gap-2 rounded-xl border border-bad/30 bg-bad/10 px-3.5 py-2.5 text-[12.5px] leading-snug text-bad">
          <LockKeyhole size={13} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || !username || !password}
        className="btn-primary mt-5 h-11 w-full justify-center text-[14px]"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
        {busy ? "Verifying…" : "Sign in"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex h-full">
      {/* ------------ left: animated mission panel ------------ */}
      <div className="hero-grid relative hidden flex-1 overflow-hidden border-r border-white/10 lg:block">
        {/* the one screen where ambient orbs are allowed to move */}
        <div
          className="login-orb h-[460px] w-[460px]"
          style={{ top: "-8%", left: "-6%", background: "rgba(34,211,238,0.16)" }}
        />
        <div
          className="login-orb h-[520px] w-[520px]"
          style={{ bottom: "-12%", right: "-8%", background: "rgba(99,102,241,0.2)", animationDelay: "-4s" }}
        />
        {/* crosshatch */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            maskImage: "radial-gradient(110% 95% at 50% 45%, #000 30%, transparent 85%)",
            WebkitMaskImage: "radial-gradient(110% 95% at 50% 45%, #000 30%, transparent 85%)",
          }}
        />

        <div className="relative flex h-full flex-col items-center justify-center px-12">
          {/* orbiting mark */}
          <div className="relative mb-10 h-28 w-28">
            <span className="orbit-ring">
              <span className="orbit-dot bg-cyan" />
            </span>
            <span className="orbit-ring-2">
              <span
                className="orbit-dot"
                style={{ background: "#818cf8", boxShadow: "0 0 10px 2px rgba(129,140,248,0.5)" }}
              />
            </span>
            <div className="absolute inset-[18px] flex items-center justify-center rounded-3xl bg-gradient-to-br from-cyan-400 to-indigo-500 shadow-[0_14px_44px_rgba(34,211,238,0.35)]">
              <Rocket size={30} className="text-[#0a0e16]" />
            </div>
          </div>

          <h2 className="font-display max-w-md text-center text-[30px] font-bold leading-[1.15] tracking-tight text-white">
            Ask your <span className="gradient-text">logistics data</span> anything
          </h2>
          <p className="mt-3 max-w-sm text-center text-[13.5px] leading-relaxed text-white/55">
            One unified dataset, three levels of intelligence: descriptive dashboards,
            a diagnostic AI analyst, and predictive demand planning.
          </p>

          <div className="stagger mt-9 flex flex-col items-center gap-2">
            {FEED.map((f) => (
              <span
                key={f.text}
                className="glass-dark flex items-center gap-2 rounded-full px-3.5 py-1.5 font-mono text-[11px] text-white/75"
              >
                <f.icon size={12} className="text-cyan-300" />
                {f.text}
              </span>
            ))}
          </div>

          <div className="absolute bottom-7 flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/40">
            <Sparkles size={11} className="text-indigo-300" />
            AI routes · engines compute · every number explained
          </div>
        </div>
      </div>

      {/* ------------ right: the form ------------ */}
      <div className="relative flex flex-1 items-center justify-center overflow-y-auto px-6 py-10">
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
