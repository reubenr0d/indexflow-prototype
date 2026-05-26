import { getOpsSnapshot } from "@/lib/ops.server";
import { OpsCompactHeader } from "@/components/ops/ops-compact-header";
import { OpsTabsNav } from "@/components/ops/ops-tabs-nav";
import { SourcesFooter } from "@/components/ops/sources-footer";

export const revalidate = 60;

export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  const snapshot = await getOpsSnapshot();

  return (
    <div className="min-h-[calc(100vh-3.5rem)]">
      <OpsCompactHeader snapshot={snapshot} />
      <OpsTabsNav />
      <main>{children}</main>
      <SourcesFooter company={snapshot.company} generatedAt={snapshot.generatedAt} />
    </div>
  );
}
