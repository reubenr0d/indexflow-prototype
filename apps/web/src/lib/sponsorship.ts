export type SponsorshipStrategy = "native_sponsor" | "smart_wallet_4337";

export function sponsorshipStrategyForChainId(chainId: number): SponsorshipStrategy {
  return chainId === 43113 ? "smart_wallet_4337" : "native_sponsor";
}
