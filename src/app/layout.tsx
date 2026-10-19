import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "./providers";

// Jost: page titles and section headings only (18px+). Inter: everything
// else — tables, forms, labels, every figure. See brand_guidelines/.
//
// Served from the repo (src/app/fonts/, SIL Open Font License, see the
// *-OFL.txt files there), not fetched from Google Fonts at build time:
// that download failed twice in CI (PR #3, PR #5). Variable fonts, Latin
// subset (the same characters next/font/google's "latin" gave us, incl.
// umlauts and €), from @fontsource-variable/inter and /jost 5.2.8. One
// file each covers every weight the app uses.
const jost = localFont({
  src: "./fonts/jost-latin-wght-normal.woff2",
  weight: "100 900",
  variable: "--font-heading-sans",
  display: "swap",
});

const inter = localFont({
  src: "./fonts/inter-latin-wght-normal.woff2",
  weight: "100 900",
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
    <html lang="de" className={`${jost.variable} ${inter.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
