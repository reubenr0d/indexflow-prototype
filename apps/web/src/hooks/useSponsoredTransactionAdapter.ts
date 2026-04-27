"use client";

import { useCallback } from "react";
import { type Address } from "viem";
import { useSendTransaction, useWallets } from "@privy-io/react-auth";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { sponsorshipStrategyForChainId, type SponsorshipStrategy } from "@/lib/sponsorship";

type SendTxParams = {
  chainId: number;
  to: Address;
  data: `0x${string}`;
  value?: bigint;
  sponsor?: boolean;
  showWalletUIs?: boolean;
};

type SponsoredTxResult = {
  hash: `0x${string}`;
};

export function useSponsoredTransactionAdapter() {
  const { sendTransaction } = useSendTransaction();
  const { wallets } = useWallets();
  const { getClientForChain } = useSmartWallets();

  const embeddedWallet = wallets.find((w) => w.walletClientType === "privy");

  const getSenderAddress = useCallback(
    async (chainId: number): Promise<Address | null> => {
      const strategy = sponsorshipStrategyForChainId(chainId);
      if (strategy === "native_sponsor") {
        return embeddedWallet?.address ? (embeddedWallet.address as Address) : null;
      }

      const client = await getClientForChain({ id: chainId });
      const account = client?.account?.address;
      return account ? (account as Address) : null;
    },
    [embeddedWallet, getClientForChain]
  );

  const sendSponsoredTx = useCallback(
    async ({ chainId, to, data, value, sponsor = true, showWalletUIs = true }: SendTxParams): Promise<SponsoredTxResult> => {
      const strategy: SponsorshipStrategy = sponsorshipStrategyForChainId(chainId);
      console.log(`[SponsoredTxAdapter] sendSponsoredTx called: chainId=${chainId} strategy=${strategy} to=${to.slice(0, 10)}...`);

      if (strategy === "native_sponsor") {
        console.log(`[SponsoredTxAdapter] Using native sponsorship for chain ${chainId}`);
        try {
          const receipt = await sendTransaction(
            {
              chainId,
              to,
              data,
              ...(value != null ? { value } : {}),
            },
            { sponsor, uiOptions: { showWalletUIs } }
          );
          console.log(`[SponsoredTxAdapter] Native tx succeeded: hash=${receipt.hash}`);
          return { hash: receipt.hash };
        } catch (err) {
          console.error(`[SponsoredTxAdapter] Native tx failed:`, err instanceof Error ? err.message : err);
          throw err;
        }
      }

      console.log(`[SponsoredTxAdapter] Using smart wallet (4337) for chain ${chainId}`);
      const smartClient = await getClientForChain({ id: chainId });
      if (!smartClient) {
        console.error(`[SponsoredTxAdapter] Smart wallet client unavailable for chain ${chainId}`);
        throw new Error(`Smart wallet client unavailable for chain ${chainId}.`);
      }

      try {
        const hash = await smartClient.sendTransaction({
          to,
          data,
          ...(value != null ? { value } : {}),
        });
        console.log(`[SponsoredTxAdapter] Smart wallet tx succeeded: hash=${hash}`);
        return { hash };
      } catch (err) {
        console.error(`[SponsoredTxAdapter] Smart wallet tx failed:`, err instanceof Error ? err.message : err);
        throw err;
      }
    },
    [getClientForChain, sendTransaction]
  );

  return {
    embeddedWallet,
    getSenderAddress,
    sendSponsoredTx,
  };
}
