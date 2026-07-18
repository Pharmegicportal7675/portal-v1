import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://portal.pharmegichealthcare.com"),
  title: "Pharmegic Healthcare Limited — Compliance Portal",
  description: "Enterprise pharmaceutical compliance and TCC certificate management portal.",
  openGraph: {
    title: "Pharmegic Healthcare Limited — Compliance Portal",
    description: "Enterprise pharmaceutical compliance and TCC certificate management portal.",
    url: "/",
    siteName: "Pharmegic Healthcare Limited",
    images: [{ url: "/pharmegic-logo.png", alt: "Pharmegic Healthcare Limited" }],
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Pharmegic Healthcare Limited — Compliance Portal",
    description: "Enterprise pharmaceutical compliance and TCC certificate management portal.",
    images: ["/pharmegic-logo.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-slate-50" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

