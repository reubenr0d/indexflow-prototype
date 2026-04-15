"use client";

import { useEffect, useId, useMemo, useState } from "react";

let mermaidReady: Promise<typeof import("mermaid")["default"]> | null = null;

function getMermaid() {
  if (!mermaidReady) {
    mermaidReady = import("mermaid").then((m) => {
      m.default.initialize({
        startOnLoad: false,
        securityLevel: "loose",
        theme: "neutral",
      });
      return m.default;
    });
  }
  return mermaidReady;
}

export function MermaidBlock({ chart }: { chart: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reactId = useId();
  const renderId = useMemo(() => `mermaid-${reactId.replace(/:/g, "")}`, [reactId]);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        const mermaid = await getMermaid();
        const { svg: out } = await mermaid.render(renderId, chart);
        if (!cancelled) {
          setSvg(out);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Mermaid render error");
          setSvg(null);
        }
      }
    }

    render();

    return () => {
      cancelled = true;
    };
  }, [chart, renderId]);

  if (error) {
    return (
      <div className="rounded-lg border border-app-warning/40 bg-app-warning/10 p-4">
        <p className="text-sm font-semibold text-app-text">Mermaid Render Error</p>
        <pre className="mt-2 overflow-x-auto text-xs text-app-muted">{error}</pre>
        <pre className="mt-3 overflow-x-auto rounded bg-app-bg p-3 text-xs text-app-muted">{chart}</pre>
      </div>
    );
  }

  if (!svg) {
    return <div className="rounded-lg border border-app-border bg-app-surface p-4 text-sm text-app-muted">Rendering diagram...</div>;
  }

  return (
    <div
      className="overflow-x-auto rounded-lg border border-app-border bg-app-surface p-4"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
