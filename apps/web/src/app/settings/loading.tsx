import { CoreRouteLoading } from "@/components/ui/page-loading";

export default function Loading() {
  return <CoreRouteLoading cardCount={3} withStats={false} withTable={false} />;
}
