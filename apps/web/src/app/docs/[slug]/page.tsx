import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocsPageContent } from "@/components/docs/docs-page-content";
import { DOCS_SLUGS, getDocsPage } from "@/lib/wiki";

interface DocsRouteParams {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return DOCS_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: DocsRouteParams): Promise<Metadata> {
  const { slug } = await params;
  const page = getDocsPage(slug);

  if (!page) {
    return {
      title: "Docs Not Found",
    };
  }

  return {
    title: `IndexFlow Docs | ${page.title}`,
    description: page.summary,
  };
}

export default async function DocsSlugPage({ params }: DocsRouteParams) {
  const { slug } = await params;
  const page = getDocsPage(slug);

  if (!page) notFound();

  return <DocsPageContent page={page} />;
}
