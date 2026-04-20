import { BigInt } from "@graphprotocol/graph-ts";
import { StateRelay, StateUpdated } from "../../generated/StateRelay/StateRelay";
import { ChainPoolState } from "../../generated/schema";

function getOrCreateChainPoolState(chainSelector: BigInt): ChainPoolState {
  const id = chainSelector.toString();
  let chain = ChainPoolState.load(id);
  if (chain == null) {
    chain = new ChainPoolState(id);
    chain.chainSelector = chainSelector;
    chain.twapPoolAmount = BigInt.zero();
    chain.availableLiquidity = BigInt.zero();
    chain.reservedAmount = BigInt.zero();
    chain.utilizationBps = BigInt.zero();
    chain.snapshotTimestamp = BigInt.zero();
    chain.snapshotCount = BigInt.zero();
    chain.updatedAt = BigInt.zero();
  }
  return chain as ChainPoolState;
}

/**
 * StateRelay is the source of routing state in the current deployment.
 * We project the keeper-posted routing table into ChainPoolState so existing
 * web queries can render all configured chains.
 */
export function handleStateUpdated(event: StateUpdated): void {
  const relay = StateRelay.bind(event.address);
  const routing = relay.try_getRoutingWeights();
  if (routing.reverted) return;

  const chainSelectors = routing.value.value0;
  const weights = routing.value.value1;
  if (chainSelectors.length != weights.length) return;

  for (let i = 0; i < chainSelectors.length; i++) {
    const chainSelector = chainSelectors[i];
    const weight = weights[i];
    const chain = getOrCreateChainPoolState(chainSelector);

    // Keep compatibility with existing web reads that derive routing from
    // twapPoolAmount proportions. Liquidity/utilization are unavailable on
    // StateRelay and remain zero until pool snapshots are indexed.
    chain.twapPoolAmount = weight;
    chain.availableLiquidity = BigInt.zero();
    chain.reservedAmount = BigInt.zero();
    chain.utilizationBps = BigInt.zero();
    chain.snapshotTimestamp = event.params.timestamp;
    chain.snapshotCount = chain.snapshotCount.plus(BigInt.fromI32(1));
    chain.updatedAt = event.block.timestamp;
    chain.save();
  }
}
