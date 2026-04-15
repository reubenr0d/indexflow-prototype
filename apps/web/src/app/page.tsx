"use client";

import dynamic from "next/dynamic";

const PrimerContent = dynamic(() => import("@/components/primer/PrimerContent"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center">
      <p className="font-mono text-xs uppercase tracking-widest text-app-muted animate-pulse">
        Loading...
      </p>
    </div>
  ),
});

export default function HomePage() {
  return <PrimerContent />;
}
