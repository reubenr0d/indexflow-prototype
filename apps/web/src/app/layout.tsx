import type { Metadata } from "next";
import { Plus_Jakarta_Sans, IBM_Plex_Mono } from "next/font/google";
import { Web3Provider } from "@/providers/Web3Provider";
import { Header } from "@/components/layout/header";
import { ToastContainer } from "@/components/ui/toast";
import "./globals.css";

const sans = Plus_Jakarta_Sans({
  variable: "--font-sans-app",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono-app",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "IndexFlow | Oracle-priced basket vaults",
  description:
    "Deposit USDC into weighted baskets priced by oracles, backed by a shared GMX-style perpetual pool. For operators and liquidity providers.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full bg-app-bg text-app-text">
        <Web3Provider>
          <Header />
          <ToastContainer />
          {children}
        </Web3Provider>
      </body>
    </html>
  );
}
