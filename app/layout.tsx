import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Noto_Sans_JP, Readex_Pro, Reem_Kufi, Zen_Kaku_Gothic_New } from "next/font/google";
import { BRAND } from "@/lib/brand";
import { LangBoot } from "@/components/LangSwitch";
import { AppMotion } from "@/components/motion/Motion";
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

// Display faces (headlines on the landing page; see :lang() rules in globals.css). Body text stays Readex Pro / Noto JP.
const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"], display: "swap" });
const reem = Reem_Kufi({ variable: "--font-reem", subsets: ["arabic"], display: "swap", preload: false });
const zen = Zen_Kaku_Gothic_New({ variable: "--font-zen", weight: ["500", "700"], display: "swap", preload: false });

export const metadata: Metadata = {
  title: { default: BRAND.name, template: `%s · ${BRAND.name}` },
  description:
    "Know when to water your farm: weather, satellites and your solar pump, with leaf diagnosis and answers in Tunisian Derja, Arabic, French, Japanese or English.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F5F2E9",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" dir="ltr" className={`${readex.variable} ${notoJp.variable} ${bricolage.variable} ${reem.variable} ${zen.variable} h-full antialiased`}>
      <body className="min-h-full">
        <LangBoot />
        <AppMotion>{children}</AppMotion>
      </body>
    </html>
  );
}
