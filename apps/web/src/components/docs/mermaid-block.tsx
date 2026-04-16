"use client";

import { useEffect, useId, useMemo, useState, useRef } from "react";

type AppTheme = "dark" | "light";

const THEME_VARS: Record<AppTheme, Record<string, string>> = {
  dark: {
    primaryColor: "#1a3a36",
    primaryBorderColor: "#2dd4bf",
    primaryTextColor: "#e9eef4",
    lineColor: "#8b96a3",
    secondaryColor: "#0c1016",
    tertiaryColor: "#141b22",
    mainBkg: "#0f1419",
    nodeBorder: "#2dd4bf",
    clusterBkg: "#0c1016",
    clusterBorder: "#1a2733",
    edgeLabelBackground: "#0f1419",
    nodeTextColor: "#e9eef4",
    textColor: "#8b96a3",
    background: "transparent",
    fontFamily: "var(--font-sans-app), ui-sans-serif, system-ui, sans-serif",
  },
  light: {
    primaryColor: "#d1f0ec",
    primaryBorderColor: "#0d9488",
    primaryTextColor: "#0a0e12",
    lineColor: "#5a6570",
    secondaryColor: "#e9edf3",
    tertiaryColor: "#f6f8fb",
    mainBkg: "#ffffff",
    nodeBorder: "#0d9488",
    clusterBkg: "#f6f8fb",
    clusterBorder: "#c8d0da",
    edgeLabelBackground: "#ffffff",
    nodeTextColor: "#0a0e12",
    textColor: "#5a6570",
    background: "transparent",
    fontFamily: "var(--font-sans-app), ui-sans-serif, system-ui, sans-serif",
  },
};

let mermaidModule: typeof import("mermaid")["default"] | null = null;

async function getMermaid() {
  if (!mermaidModule) {
    const m = await import("mermaid");
    mermaidModule = m.default;
  }
  return mermaidModule;
}

function resolveTheme(): AppTheme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function MermaidBlock({ chart }: { chart: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const renderCount = useRef(0);

  const reactId = useId();
  const baseId = useMemo(() => `mermaid-${reactId.replace(/:/g, "")}`, [reactId]);

  const [appTheme, setAppTheme] = useState<AppTheme>(resolveTheme);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setAppTheme(resolveTheme());
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    renderCount.current += 1;
    const renderId = `${baseId}-${renderCount.current}`;

    async function render() {
      try {
        const mermaid = await getMermaid();
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "loose",
          theme: "base",
          themeVariables: THEME_VARS[appTheme],
        });
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
  }, [chart, baseId, appTheme]);

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
      className="mermaid-themed primer-glow-card overflow-x-auto rounded-lg border border-app-border bg-app-surface p-4 [&_svg]:mx-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
