import type { Metadata, Viewport } from "next";
import { Readex_Pro } from "next/font/google";
import "./globals.css";

// One family for both scripts: English UI and Tunisian Derja (Arabic script) subtitles.
const readex = Readex_Pro({
  variable: "--font-readex",
  subsets: ["latin", "arabic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Goutte d'Or AI",
  description:
    "Digital twin of a solar-pumped Tunisian farm: when to pump, when to irrigate, how much — with leaf diagnosis and alerts in Tunisian Derja.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#EEF1EC",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${readex.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
