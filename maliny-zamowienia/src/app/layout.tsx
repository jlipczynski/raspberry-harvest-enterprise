import type { Metadata, Viewport } from "next";
import "./globals.css";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "Maliny — Zamówienia",
  description: "Zamówienia na maliny: przetwory (II gat.) i Premium (I klasa).",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#c2185b",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pl">
      <body className="min-h-screen">
        <div className="mx-auto w-full max-w-screen-sm px-4 pb-28 pt-4">{children}</div>
        <Nav />
      </body>
    </html>
  );
}
