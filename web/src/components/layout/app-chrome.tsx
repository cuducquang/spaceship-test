"use client";

import { usePathname } from "next/navigation";
import { Footer } from "./footer";
import { Header } from "./header";

/** App frame (header + status bar) — suppressed on the login screen. */
export function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/login") {
    return <main className="h-screen overflow-hidden">{children}</main>;
  }
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Header />
      <main className="min-h-0 min-w-0 flex-1 overflow-hidden">{children}</main>
      <Footer />
    </div>
  );
}
