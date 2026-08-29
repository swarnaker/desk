import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Header } from "@/components/Header";
import { HealthFooter } from "@/components/HealthFooter";
import { COOKIE_NAME, verifySession } from "@/lib/server/auth";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "LINE",
  description: "Signal-only launchpad radar for Pons, o1, Base, and Pump.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const signedIn = await verifySession(jar.get(COOKIE_NAME)?.value);
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap" />
      </head>
      <body className="min-h-screen bg-bg text-ink">
        <Providers>
          <Header signedIn={signedIn} />
          <main className="mx-auto max-w-[1600px] px-3 pb-16 pt-2">{children}</main>
          <HealthFooter />
        </Providers>
      </body>
    </html>
  );
}
