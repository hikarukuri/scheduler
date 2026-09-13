import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_JP, Noto_Serif_JP, Source_Serif_4 } from "next/font/google";
import "./globals.css";

/**
 * §8.2 — two families, clearly distinct. Each chain lists a Latin face first
 * and a Japanese face as fallback, so a title mixing both scripts renders
 * without a visible step in weight or size. The Japanese faces are not
 * preloaded: they are large, and they are only reached by fallback.
 */
const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["300", "400", "600", "700"],
  variable: "--font-source-serif",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
  display: "swap",
});

const notoSerifJP = Noto_Serif_JP({
  weight: ["400", "600"],
  variable: "--font-noto-serif-jp",
  display: "swap",
  preload: false,
});

const notoSansJP = Noto_Sans_JP({
  weight: ["400", "500"],
  variable: "--font-noto-sans-jp",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "Study Planner",
  description: "Working backwards from dated commitments.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fbfbfb",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${sourceSerif.variable} ${inter.variable} ${notoSerifJP.variable} ${notoSansJP.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
