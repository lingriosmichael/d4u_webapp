import type { Metadata } from "next";
import { Jost, Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

// Jost: page titles and section headings only (18px+). Inter: everything
// else — tables, forms, labels, every figure. See brand_guidelines/.
const jost = Jost({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-heading-sans",
  display: "swap",
});

const inter = Inter({
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
    <html lang="de" className={`${jost.variable} ${inter.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
