import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, JetBrains_Mono, Newsreader } from "next/font/google";
import "./globals.css";

const fontUi = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-ui" });
const fontSerif = Newsreader({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-serif" });
const fontMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Translatarr",
  description: "Provider-agnostic LLM translation app",
};

export const viewport: Viewport = {
  themeColor: "#0b100f",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${fontUi.variable} ${fontSerif.variable} ${fontMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
