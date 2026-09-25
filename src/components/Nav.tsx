"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Dashboard", short: "Home", icon: "M3 12l9-8 9 8v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z" },
  { href: "/upload", label: "Upload bills", short: "Upload", icon: "M12 16V4m0 0l-4 4m4-4l4 4M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" },
  { href: "/bills", label: "Bills", short: "Bills", icon: "M6 3h9l4 4v14a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1zm2 8h8M8 15h8" },
  { href: "/ask", label: "Ask your bills", short: "Ask", icon: "M4 5h16v10H9l-5 4V5z" },
  { href: "/settings", label: "Settings", short: "Settings", icon: "M12 8a4 4 0 100 8 4 4 0 000-8zm8 4l-2 .6a6 6 0 01-.7 1.7l1 1.8-1.4 1.4-1.8-1a6 6 0 01-1.7.7L13 20h-2l-.6-2a6 6 0 01-1.7-.7l-1.8 1-1.4-1.4 1-1.8A6 6 0 015.8 13L4 12.4v-.8l1.8-.6a6 6 0 01.7-1.7l-1-1.8 1.4-1.4 1.8 1A6 6 0 0110.4 6L11 4h2l.6 2a6 6 0 011.7.7l1.8-1 1.4 1.4-1 1.8a6 6 0 01.7 1.7L20 11.2z" },
];

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path.startsWith(href);
}

export function TopNav() {
  const path = usePathname();
  return (
    <nav className="hidden gap-4 text-sm text-slate-600 md:flex">
      {items.map((n) => (
        <Link key={n.href} href={n.href} className={isActive(path, n.href) ? "font-medium text-slate-900" : "hover:text-slate-900"}>
          {n.label}
        </Link>
      ))}
    </nav>
  );
}

export function BottomNav() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden print:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <ul className="grid grid-cols-5">
        {items.map((n) => {
          const active = isActive(path, n.href);
          return (
            <li key={n.href}>
              <Link href={n.href} className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] ${active ? "text-amber-700" : "text-slate-500"}`}>
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d={n.icon} />
                </svg>
                {n.short}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
