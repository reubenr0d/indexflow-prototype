"use client";

import { useEffect, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import { identifyLogRocketUser, trackLogRocketEvent } from "@/lib/logrocket";

/** Privy sessions: prefer immutable Privy user id, attach wallet + email traits. */
export function LogRocketIdentifyPrivy() {
  const { ready, authenticated, user } = usePrivy();
  const { address } = useAccount();
  const lastUidRef = useRef<string | null>(null);

  const wallet = address?.toLowerCase();
  const email = user?.email?.address;
  const uid =
    ready && authenticated ? (user?.id ?? wallet) : undefined;

  useEffect(() => {
    if (!uid || lastUidRef.current === uid) return;
    lastUidRef.current = uid;
    const traits: Record<string, string> = {};
    if (wallet) traits.walletAddress = wallet;
    if (email) traits.email = email;
    identifyLogRocketUser(uid, traits);
    trackLogRocketEvent("LoginCompleted");
  }, [email, uid, wallet]);

  return null;
}

/** Wagmi-only fallback (no Privy): identify by connected wallet address. */
export function LogRocketIdentifyWallet() {
  const { address, isConnected } = useAccount();
  const lastUidRef = useRef<string | null>(null);
  const uid = isConnected ? address?.toLowerCase() : undefined;

  useEffect(() => {
    if (!uid || lastUidRef.current === uid) return;
    lastUidRef.current = uid;
    identifyLogRocketUser(uid, { walletAddress: uid });
    trackLogRocketEvent("LoginCompleted");
  }, [uid]);

  return null;
}
