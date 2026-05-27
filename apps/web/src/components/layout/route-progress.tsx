"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function RouteProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [active, setActive] = useState(false);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const link = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!link) return;
      if (link.target && link.target !== "_self") return;
      const href = link.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;

      const nextUrl = new URL(link.href, window.location.origin);
      if (nextUrl.origin !== window.location.origin) return;
      const current = window.location.pathname + window.location.search;
      const next = nextUrl.pathname + nextUrl.search;
      if (current === next) return;

      setActive(true);
      setProgress(18);
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    if (!active) return;
    timerRef.current = window.setInterval(() => {
      setProgress((value) => Math.min(value + 8, 90));
    }, 120);

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const finishTick = window.setTimeout(() => {
      setProgress(100);
    }, 0);
    const end = window.setTimeout(() => {
      setActive(false);
      setProgress(0);
    }, 180);
    return () => {
      window.clearTimeout(finishTick);
      window.clearTimeout(end);
    };
  }, [pathname, searchParams, active]);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[75] h-0.5">
      <div
        className="h-full bg-app-accent transition-all duration-150 ease-out"
        style={{ width: `${progress}%`, opacity: active ? 1 : 0 }}
      />
    </div>
  );
}
