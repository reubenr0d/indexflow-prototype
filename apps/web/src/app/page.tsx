import PrimerContent from "@/components/primer/PrimerContent";
import { PriceTickerHydrated } from "@/components/layout/price-ticker";
import { fetchTickerData } from "@/lib/ticker.server";

export default async function HomePage() {
  const tickerData = await fetchTickerData().catch(() => []);

  return (
    <>
      <PriceTickerHydrated initialData={tickerData} />
      <PrimerContent />
    </>
  );
}
