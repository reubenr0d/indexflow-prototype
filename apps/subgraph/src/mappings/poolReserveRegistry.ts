import { BigInt } from "@graphprotocol/graph-ts";
import {
  PoolSnapshot,
  RemoteStateUpdated,
} from "../../generated/PoolReserveRegistry/PoolReserveRegistry";
import { PoolSnapshotEvent, CoordinationState, ChainPoolState } from "../../generated/schema";

const BPS = BigInt.fromI32(10_000);

function getOrCreateCoordinationState(): CoordinationState {
  let state = CoordinationState.load("singleton");
  if (state == null) {
    state = new CoordinationState("singleton");
    state.latestTwapPoolAmount = BigInt.zero();
    state.latestAvailableLiquidity = BigInt.zero();
    state.latestUtilizationBps = BigInt.zero();
    state.latestSnapshotTimestamp = BigInt.zero();
    state.snapshotCount = BigInt.zero();
    state.updatedAt = BigInt.zero();
  }
  return state as CoordinationState;
}

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

export function handlePoolSnapshot(event: PoolSnapshot): void {
  const s = event.params.state;
  const entityId = event.transaction.hash.toHexString().concat("-").concat(event.logIndex.toString());

  const snap = new PoolSnapshotEvent(entityId);
  snap.chainSelector = s.chainSelector;
  snap.twapPoolAmount = s.twapPoolAmount;
  snap.instantPoolAmount = s.instantPoolAmount;
  snap.reservedAmount = s.reservedAmount;
  snap.availableLiquidity = s.availableLiquidity;
  snap.utilizationBps = s.utilizationBps;
  snap.oracleConfigHash = s.oracleConfigHash;
  snap.hasBrokenFeeds = s.hasBrokenFeeds;
  snap.snapshotTimestamp = s.timestamp;
  snap.blockNumber = event.block.number;
  snap.txHash = event.transaction.hash;
  snap.logIndex = event.logIndex;
  snap.createdAt = event.block.timestamp;
  snap.save();

  const coordination = getOrCreateCoordinationState();
  coordination.latestTwapPoolAmount = s.twapPoolAmount;
  coordination.latestAvailableLiquidity = s.availableLiquidity;
  coordination.latestUtilizationBps = s.utilizationBps;
  coordination.latestSnapshotTimestamp = s.timestamp;
  coordination.snapshotCount = coordination.snapshotCount.plus(BigInt.fromI32(1));
  coordination.updatedAt = event.block.timestamp;
  coordination.save();

  const chain = getOrCreateChainPoolState(s.chainSelector);
  chain.twapPoolAmount = s.twapPoolAmount;
  chain.availableLiquidity = s.availableLiquidity;
  chain.reservedAmount = s.reservedAmount;
  chain.utilizationBps = s.utilizationBps;
  chain.snapshotTimestamp = s.timestamp;
  chain.snapshotCount = chain.snapshotCount.plus(BigInt.fromI32(1));
  chain.updatedAt = event.block.timestamp;
  chain.save();
}

export function handleRemoteStateUpdated(event: RemoteStateUpdated): void {
  const chainSelector = event.params.chainSelector;
  const twap = event.params.twapPoolAmount;
  const avail = event.params.availableLiquidity;
  const reserved = twap.gt(avail) ? twap.minus(avail) : BigInt.zero();
  const utilBps = twap.gt(BigInt.zero()) ? reserved.times(BPS).div(twap) : BigInt.zero();

  const chain = getOrCreateChainPoolState(chainSelector);
  chain.twapPoolAmount = twap;
  chain.availableLiquidity = avail;
  chain.reservedAmount = reserved;
  chain.utilizationBps = utilBps;
  chain.snapshotCount = chain.snapshotCount.plus(BigInt.fromI32(1));
  chain.updatedAt = event.block.timestamp;
  chain.save();
}
