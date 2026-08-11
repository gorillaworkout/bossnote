import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BossNote",
  description: "Voice task manager — your boss speaks, you deliver",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className="dark">
      <body className="min-h-screen bg-[var(--bg)] text-[var(--text)] antialiased">
        {children}
      </body>
    </html>
  );
}
