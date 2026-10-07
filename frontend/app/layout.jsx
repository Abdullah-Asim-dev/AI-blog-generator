import "./globals.css";
import { Bricolage_Grotesque, Hanken_Grotesk, Newsreader, Noto_Nastaliq_Urdu } from "next/font/google";
import TopBar from "./TopBar";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const ui = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-ui", display: "swap" });
const serif = Newsreader({ subsets: ["latin"], variable: "--font-serif", display: "swap" });
const urdu = Noto_Nastaliq_Urdu({ subsets: ["arabic"], variable: "--font-urdu", display: "swap" });

export const metadata = {
  title: "LuminaWrite AI — Pro Content Suite",
  description: "Write, check and publish SEO blog posts in four steps.",
};

// Runs before first paint so the page never flashes the wrong theme
const themeScript = `try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${display.variable} ${ui.variable} ${serif.variable} ${urdu.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex h-dvh w-full flex-col overflow-hidden bg-canvas text-slate-200 antialiased">
        <TopBar />
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </body>
    </html>
  );
}