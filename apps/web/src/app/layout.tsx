import type { Metadata, Viewport } from "next";
import dynamic from "next/dynamic";
import { Plus_Jakarta_Sans, IBM_Plex_Mono } from "next/font/google";
import { Web3Provider } from "@/providers/Web3Provider";
import { Footer } from "@/components/layout/footer";
import { PriceTickerHydrated } from "@/components/layout/price-ticker";
import { fetchTickerData } from "@/lib/ticker.server";
import { PwaBootstrap } from "@/components/pwa/pwa-bootstrap";
import { TourProvider } from "@/components/onboarding/tour-provider";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const Header = dynamic(
  () => import("@/components/layout/header").then((m) => ({ default: m.Header })),
);

const ToastContainer = dynamic(
  () => import("@/components/ui/toast").then((m) => ({ default: m.ToastContainer })),
);

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const tickerData = await fetchTickerData().catch(() => []);

  return (
    <html lang="en" className={`dark ${sans.variable} ${mono.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `try{if(localStorage.getItem('theme')==='light')document.documentElement.classList.remove('dark')}catch(e){}` }} />
      </head>
      <body className="min-h-full bg-app-bg text-app-text">
        <PwaBootstrap />
        <Web3Provider>
          <TourProvider>
            <PriceTickerHydrated initialData={tickerData} />
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
