"use client";

import { useEffect } from "react";
import setupLogRocketReact from "logrocket-react";
import { initLogRocket, isLogRocketEnabled } from "@/lib/logrocket";

/** Runs LogRocket.init + React plugin once on the client. */
export function LogRocketBootstrap() {
  useEffect(() => {
    initLogRocket();
    if (isLogRocketEnabled()) {
      setupLogRocketReact();
    }
  }, []);

  return null;
}
