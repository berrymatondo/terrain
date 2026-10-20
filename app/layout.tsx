import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { ThemeSync } from "@/components/theme-toggle";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pilotage commercial | Emergence RDC",
  description:
    "Tableau de bord de suivi des prospects, actions et opportunités commerciales d’Emergence RDC.",
  generator: "v0.app",
  icons: {
    icon: [
      {
        url: "/icon-light-32x32.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/icon-dark-32x32.png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/icon.svg",
        type: "image/svg+xml",
      },
    ],
    apple: "/apple-icon.png",
  },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "black" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    // « Système » est résolu côté navigateur par <ThemeSync />, d'où suppressHydrationWarning.
    <html lang="fr" data-theme={theme} className={theme === "dark" ? "dark" : undefined} suppressHydrationWarning>
      <body className="antialiased" cz-shortcut-listen="true">
        <ThemeSync />
        {children}
        {process.env.NODE_ENV === "production" && <Analytics />}
      </body>
    </html>
  );
}
