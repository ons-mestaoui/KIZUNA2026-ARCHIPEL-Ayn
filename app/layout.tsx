import type { Metadata, Viewport } from "next";
import { Noto_Sans_JP, Readex_Pro } from "next/font/google";
import { LangBoot } from "@/components/LangSwitch";
import "./globals.css";

// Readex Pro covers Latin + Arabic (English UI and Derja subtitles); Noto Sans JP covers kana/kanji.
const readex = Readex_Pro({
  variable: "--font-readex",
  subsets: ["latin", "arabic"],
  display: "swap",
});
const notoJp = Noto_Sans_JP({
  variable: "--font-noto-jp",
  weight: ["400", "500", "700"],
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "Goutte d'Or",
  description:
    "Know when to water your farm: weather, satellites and your solar pump, with leaf diagnosis and answers in Tunisian Derja, Arabic, French, Japanese or English.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#EEF1EC",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" dir="ltr" className={`${readex.variable} ${notoJp.variable} h-full antialiased`}>
      <body className="min-h-full">
        <LangBoot />
        {children}
      </body>
    </html>
  );
}
