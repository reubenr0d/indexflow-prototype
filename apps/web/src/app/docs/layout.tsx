"use client";

import { usePathname } from "next/navigation";
import { DocsLayoutNav } from "@/components/docs/docs-layout-nav";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-[calc(100vh-3.5rem)] lg:flex">
      <DocsLayoutNav pathname={pathname} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}
