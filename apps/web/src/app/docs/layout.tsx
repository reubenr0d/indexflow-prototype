import { DocsLayoutNav } from "@/components/docs/docs-layout-nav";
import { getDocsManifest } from "@/lib/docs.server";

export default async function DocsLayout({ children }: { children: React.ReactNode }) {
  const docs = await getDocsManifest();

  return (
    <div className="min-h-[calc(100vh-3.5rem)] lg:flex">
      <DocsLayoutNav docs={docs} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}
