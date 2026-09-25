import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { BottomNav, TopNav } from "@/components/Nav";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "WattWatch — AI energy bill investigator",
  description: "Turns DEWA electricity bills into prioritised, evidence-backed savings actions.",
  applicationName: "WattWatch",
  appleWebApp: { capable: true, title: "WattWatch", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#fbbf24",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur print:hidden">
          <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-2.5 md:gap-6 md:px-6 md:py-3">
            <Link href="/" className="flex items-center gap-2 font-semibold text-slate-900">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-amber-400 text-sm font-bold text-slate-900">W</span>
              WattWatch
            </Link>
            <TopNav />
            <span className="ml-auto text-xs text-slate-400">
              <span className="hidden sm:inline">DEWA tariff · </span>scenarios, not guarantees
            </span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-6 print:p-0">{children}</main>
        <BottomNav />
      </body>
    </html>
  );
}
