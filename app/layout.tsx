import type { Metadata, Viewport } from "next";
import DisclaimerBar from "@/components/DisclaimerBar";
import NavBar from "@/components/NavBar";
import { DISCLAIMER_TEXT } from "@/lib/disclaimer";
import "./globals.css";

const SITE_URL = "https://aethersky.vercel.app";
const SHARE_TITLE = "aethersky: live US air traffic with a simple conflict check";
const SHARE_DESCRIPTION =
  "An open-source advisory demo. Real ADS-B traffic over the United States, with pairs that look like they are converging. Not certified, not for navigation.";

export const metadata: Metadata = {
  // Lets link previews resolve the image files in this folder
  // (opengraph-image.png and twitter-image.png) to full addresses.
  metadataBase: new URL(SITE_URL),
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "aethersky",
    title: SHARE_TITLE,
    description: SHARE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: SHARE_TITLE,
    description: SHARE_DESCRIPTION,
  },
  title: "aethersky: advisory traffic and conflict demo",
  description: `A free, non-certified public demo of ADS-B traffic with a simple geometric conflict check. ${DISCLAIMER_TEXT}`,
};

export const viewport: Viewport = {
  themeColor: "#0e0b14",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex h-dvh flex-col overflow-hidden">
        {/* Always visible on every page. There is no dismiss control. */}
        <DisclaimerBar />
        <NavBar />
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </body>
    </html>
  );
}
