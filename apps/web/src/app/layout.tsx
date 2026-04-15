import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, IBM_Plex_Mono } from "next/font/google";
import { Web3Provider } from "@/providers/Web3Provider";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { PwaBootstrap } from "@/components/pwa/pwa-bootstrap";
import { ToastContainer } from "@/components/ui/toast";
import { TourProvider } from "@/components/onboarding/tour-provider";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
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

const siteTitle = "IndexFlow | Oracle-priced basket vaults";
const siteDescription =
  "Deposit USDC into weighted baskets priced by oracles, backed by a shared GMX-style perpetual pool. For operators and liquidity providers.";

export const metadata: Metadata = {
  metadataBase: new URL("https://indexflow.app"),
  title: siteTitle,
  description: siteDescription,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "IndexFlow",
  },
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    url: "https://indexflow.app",
    siteName: "IndexFlow",
    locale: "en_US",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "IndexFlow — Oracle-priced basket vaults" }],
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: ["/og-image.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${sans.variable} ${mono.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `try{if(localStorage.getItem('theme')==='light')document.documentElement.classList.remove('dark')}catch(e){}` }} />
      </head>
      <body className="min-h-full bg-app-bg text-app-text">
        <PwaBootstrap />
        <Web3Provider>
          <TourProvider>
            <Header />
            <ToastContainer />
            {children}
            <Footer />
          </TourProvider>
        </Web3Provider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
