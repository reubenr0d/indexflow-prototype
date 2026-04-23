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

      if (strategy === "native_sponsor") {
        const receipt = await sendTransaction(
          {
            chainId,
            to,
            data,
            ...(value != null ? { value } : {}),
          },
          { sponsor, uiOptions: { showWalletUIs } }
        );
        return { hash: receipt.hash };
      }

      const smartClient = await getClientForChain({ id: chainId });
      if (!smartClient) {
        throw new Error(`Smart wallet client unavailable for chain ${chainId}.`);
      }

      const hash = await smartClient.sendTransaction({
        to,
        data,
        ...(value != null ? { value } : {}),
      });
      return { hash };
    },
    [getClientForChain, sendTransaction]
  );

  return {
    embeddedWallet,
    getSenderAddress,
    sendSponsoredTx,
  };
}
