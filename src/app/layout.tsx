import type { Metadata } from "next";
import { Sora, Manrope } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const sora = Sora({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-heading-sans",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "D4U Finance — Belegverwaltung",
  description:
    "Interne Belegverwaltung für D4U: Belege einreichen, prüfen und Projektbudgets im Blick behalten.",
  robots: { index: false, follow: false },
  openGraph: {
    title: "D4U Finance — Belegverwaltung",
    description: "Interne Belegverwaltung für D4U.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={`${sora.variable} ${manrope.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
