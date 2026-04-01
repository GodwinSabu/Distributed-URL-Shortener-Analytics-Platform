import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });

export const metadata: Metadata = {
  title:       "URL Shortener Analytics",
  description: "Real-time analytics dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${geist.variable} font-sans antialiased min-h-screen`}>
        <nav className="border-b border-slate-800 px-6 py-4 flex items-center gap-4">
          <a href="/" className="text-lg font-bold text-indigo-400 tracking-tight">
            ⚡ snip.ly
          </a>
          <span className="text-slate-600 text-sm">
            Distributed URL Shortener
          </span>
          <div className="ml-auto flex gap-2 text-xs text-slate-500">
            <span className="px-2 py-1 rounded bg-slate-800">Bun.js</span>
            <span className="px-2 py-1 rounded bg-slate-800">Kafka</span>
            <span className="px-2 py-1 rounded bg-slate-800">ClickHouse</span>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  );
}