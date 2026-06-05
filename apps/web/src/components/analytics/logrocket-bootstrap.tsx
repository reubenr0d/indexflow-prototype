"use client";

import { useEffect } from "react";
import setupLogRocketReact from "logrocket-react";
import {
  LogRocket,
  getLogRocketRelease,
  initLogRocket,
  isLogRocketEnabled,
  trackLogRocketEvent,
} from "@/lib/logrocket";

let probeTrackedThisPage = false;

/** Runs LogRocket.init + React plugin once on the client. */
export function LogRocketBootstrap() {
  useEffect(() => {
    initLogRocket();
    if (isLogRocketEnabled()) {
      setupLogRocketReact(LogRocket);
      if (!probeTrackedThisPage) {
        probeTrackedThisPage = true;
        trackLogRocketEvent("ProdLogRocketProbe", {
          probeId: "prod-probe-v1",
          host: window.location.host,
          pathname: window.location.pathname,
          timestampIso: new Date().toISOString(),
          buildSha: getLogRocketRelease(),
        });
      }
    }
  }, []);

  return null;
}
