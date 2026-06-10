import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const grotesk = Space_Grotesk({
  variable: "--font-grotesk",
  subsets: ["latin"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Spaceship — AI Logistics Analytics",
  description:
    "AI-powered logistics analytics: dashboards, natural-language queries, demand forecasting and an evolving knowledge base.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${grotesk.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <body className="h-full">
        <div className="flex h-screen flex-col overflow-hidden">
          <Header />
          <main className="min-h-0 min-w-0 flex-1 overflow-hidden">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
