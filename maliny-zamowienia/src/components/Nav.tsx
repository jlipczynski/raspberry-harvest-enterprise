"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Pulpit", icon: "🏠" },
  { href: "/zamowienia", label: "Zamówienia", icon: "🧺" },
  { href: "/dostawy", label: "Dostawy", icon: "🚚" },
  { href: "/historia", label: "Historia", icon: "📋" },
  { href: "/klienci", label: "Klienci", icon: "👤" },
];

export default function Nav() {
  const pathname = usePathname();

  // Ukryj nawigację na logowaniu i w widoku do druku
  if (pathname === "/login" || pathname.startsWith("/druk")) return null;

  return (
    <nav className="no-print fixed bottom-0 left-0 right-0 z-20 border-t border-gray-200 bg-white">
      <div className="mx-auto flex max-w-screen-sm items-stretch justify-around">
        {ITEMS.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs ${
                active ? "text-raspberry" : "text-gray-500"
              }`}
            >
              <span className="text-xl leading-none">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
