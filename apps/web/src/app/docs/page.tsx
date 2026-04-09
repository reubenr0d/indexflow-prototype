import type { Metadata } from "next";
import { DocsHomeClient } from "@/components/docs/docs-home-client";
import { getDocsManifest } from "@/lib/docs.server";

export const metadata: Metadata = {
  title: "IndexFlow Docs",
  description: "Repository-backed docs and runbooks for protocol operators and integrators.",
};

export default async function DocsHomePage() {
  const docs = await getDocsManifest();
  return <DocsHomeClient docs={docs} />;
}
