import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "WattWatch — AI energy bill investigator",
  description: "Turns DEWA electricity bills into prioritised, evidence-backed savings actions.",
};

const nav = [
  { href: "/", label: "Dashboard" },
  { href: "/upload", label: "Upload bills" },
  { href: "/bills", label: "Bills" },
  { href: "/ask", label: "Ask your bills" },
  { href: "/settings", label: "Settings" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        <header className="border-b border-slate-200 bg-white print:hidden">
          <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
            <Link href="/" className="flex items-center gap-2 font-semibold text-slate-900">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-amber-400 text-sm font-bold text-slate-900">W</span>
              WattWatch
            </Link>
            <nav className="flex gap-4 text-sm text-slate-600">
              {nav.map((n) => (
                <Link key={n.href} href={n.href} className="hover:text-slate-900">
                  {n.label}
                </Link>
              ))}
            </nav>
            <span className="ml-auto text-xs text-slate-400">DEWA tariff · scenarios, not guarantees</span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-6">{children}</main>
      </body>
    </html>
  );
}
