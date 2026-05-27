import { Skeleton } from "@/components/ui/skeleton";
import { PageWrapper } from "@/components/layout/page-wrapper";

export function LoadingHeader() {
  return (
    <div className="mb-8 space-y-3">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-10 w-56" />
      <Skeleton className="h-4 w-80 max-w-full" />
    </div>
  );
}

export function LoadingStatGrid({ count = 3 }: { count?: number }) {
  return (
    <div className="mb-8 grid gap-3 sm:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-app-border bg-app-surface p-4">
          <Skeleton className="mb-3 h-3 w-24" />
          <Skeleton className="h-7 w-20" />
        </div>
      ))}
    </div>
  );
}

export function LoadingCardGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-app-border bg-app-surface p-6">
          <Skeleton className="mb-4 h-5 w-36" />
          <Skeleton className="mb-2 h-7 w-24" />
          <Skeleton className="mb-4 h-3 w-20" />
          <Skeleton className="h-1.5 w-full" />
        </div>
      ))}
    </div>
  );
}

export function LoadingTable({ rows = 6 }: { rows?: number }) {
  return (
    <div className="rounded-xl border border-app-border bg-app-surface p-4">
      <Skeleton className="mb-4 h-5 w-40" />
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="grid grid-cols-4 gap-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function CoreRouteLoading({
  cardCount = 6,
  withStats = true,
  withTable = false,
}: {
  cardCount?: number;
  withStats?: boolean;
  withTable?: boolean;
}) {
  return (
    <PageWrapper>
      <LoadingHeader />
      {withStats ? <LoadingStatGrid /> : null}
      <LoadingCardGrid count={cardCount} />
      {withTable ? <div className="mt-6"><LoadingTable /></div> : null}
    </PageWrapper>
  );
}
