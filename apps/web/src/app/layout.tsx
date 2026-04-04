import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Web3Provider } from "@/providers/Web3Provider";
import { Header } from "@/components/layout/header";
import { ToastContainer } from "@/components/ui/toast";
import "./globals.css";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Perp Baskets",
  description: "Oracle-priced basket vaults backed by a shared perpetual liquidity pool",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable} h-full antialiased`}>
      <body className="min-h-full bg-neutral-50 dark:bg-neutral-950">
        <Web3Provider>
          <Header />
          <ToastContainer />
          {children}
        </Web3Provider>
      </body>
    </html>
  );
}
