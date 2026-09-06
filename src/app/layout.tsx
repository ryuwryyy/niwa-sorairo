import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "niwa-sorairo — garden sky color palettes",
  description:
    "A small Next.js demo that serves garden-sky color palettes by time of day.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-white text-slate-900">
        {children}
      </body>
    </html>
  );
}
