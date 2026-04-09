import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { DocsPageContent } from "@/components/docs/docs-page-content";
import { getAllDocsRouteSlugs, getDocBySlug, resolveCanonicalDocsSlug } from "@/lib/docs.server";

interface DocsRouteParams {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = await getAllDocsRouteSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: DocsRouteParams): Promise<Metadata> {
  const { slug } = await params;
  const doc = await getDocBySlug(slug);

  if (!doc) {
    return {
      title: "Docs Not Found",
    };
  }

  return {
    title: `IndexFlow Docs | ${doc.title}`,
    description: doc.summary,
  };
}

export default async function DocsSlugPage({ params }: DocsRouteParams) {
  const { slug } = await params;
  const doc = await getDocBySlug(slug);

  if (!doc) notFound();

  const canonical = resolveCanonicalDocsSlug(slug);
  if (canonical && slug !== canonical) {
    redirect(`/docs/${canonical}`);
  }

  return <DocsPageContent doc={doc} />;
}
