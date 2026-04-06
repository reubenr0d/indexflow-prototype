import type { Metadata } from "next";
import { DocsHomeClient } from "@/components/docs/docs-home-client";

export const metadata: Metadata = {
  title: "IndexFlow Docs",
  description: "In-app wiki and operational runbooks for operators and integrators.",
};

export default function DocsHomePage() {
  return <DocsHomeClient />;
}
