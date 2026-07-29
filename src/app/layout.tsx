import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { BasiraCopilot } from "@/components/BasiraCopilot";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ayn — Meta Ads MCP Dashboard",
  description:
    "Analytics dashboard and AI copilot backed by the Meta Ads MCP server.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* Extensions (Grammarly, ColorZilla, MozBar, …) stamp attributes onto <body>
          before React hydrates — data-gr-ext-installed, cz-shortcut-listen and the
          like — which React reports as a hydration mismatch we cannot fix from here.
          This suppresses the warning for <body>'s own attributes ONLY; genuine
          mismatches inside the tree are still reported. */}
      <body suppressHydrationWarning className="min-h-full flex flex-col">
        {children}

        {/* The copilot lives in the layout so it is on every screen — landing, setup,
            dashboard, report — rather than being re-mounted (and losing its thread)
            by each page. It receives the company id, never the access token. */}
        <BasiraCopilot />
      </body>
    </html>
  );
}
