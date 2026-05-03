import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Quantified Self",
  description: "Personal time-tracking PWA — log activities to Google Calendar with one tap.",
  appleWebApp: {
    capable: true,
    title: "QSelf",
    statusBarStyle: "black-translucent",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ff5b1f",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${jetbrainsMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-bg text-ink font-mono">{children}</body>
    </html>
  );
}
