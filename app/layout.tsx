import type { Metadata, Viewport } from "next";
import DisclaimerBar from "@/components/DisclaimerBar";
import { DISCLAIMER_TEXT } from "@/lib/disclaimer";
import "./globals.css";

export const metadata: Metadata = {
  title: "aethersky: advisory traffic and conflict demo",
  description: `A free, non-certified public demo of ADS-B traffic with a simple geometric conflict check. ${DISCLAIMER_TEXT}`,
};

export const viewport: Viewport = {
  themeColor: "#0b0d10",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex h-dvh flex-col overflow-hidden">
        {/* Always visible on every page. There is no dismiss control. */}
        <DisclaimerBar />
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </body>
    </html>
  );
}
