import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Virtual Metallurgy Lab — AI Materials Simulation",
  description:
    "AI-driven materials simulation platform: ML surrogate phase diagrams, generative diffusion microstructures, and causal inference for alloy design.",
  keywords: [
    "metallurgy",
    "CALPHAD",
    "phase diagram",
    "diffusion model",
    "causal inference",
    "DoWhy",
    "PyTorch",
    "materials informatics",
  ],
  authors: [{ name: "Virtual Metallurgy Lab" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "Virtual Metallurgy Lab",
    description: "AI-driven materials simulation platform",
    siteName: "Virtual Metallurgy Lab",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Virtual Metallurgy Lab",
    description: "AI-driven materials simulation platform",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
