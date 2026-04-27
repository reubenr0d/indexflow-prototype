import {
  BasketFactory,
  BasketVault,
  VaultAccounting,
  OracleAdapter,
  StateRelay,
  type Basket,
  type User,
  type UserBasketPosition,
  type BasketExposure,
  type ProtocolState,
  type VaultStateCurrent,
} from "generated";
import { type Address } from "viem";
import {
  readBasketAssetAt,
  readBasketChainState,
  readPositionExposureSize,
  readRoutingWeights,
  readVaultAccountingState,
} from "./utils/contractCalls";

const ZERO = 0n;
const PROTOCOL_STATE_PREFIX = "protocol";
const SNAPSHOT_PERIOD_1D = "1d";
const SNAPSHOT_PERIOD_7D = "7d";
const DAY_SECONDS = 24n * 60n * 60n;
const WEEK_SECONDS = 7n * 24n * 60n * 60n;

function toInt(chainId: number | bigint): number {
  return Number(chainId);
}

function ts(block: { timestamp: number | bigint }): bigint {
  return typeof block.timestamp === "bigint" ? block.timestamp : BigInt(block.timestamp);
}

function bn(block: { number: number | bigint }): bigint {
  return typeof block.number === "bigint" ? block.number : BigInt(block.number);
}

function lc(value: string): string {
  return value.toLowerCase();
}

function basketId(chainId: number, vault: string): string {
  return `${chainId}-${lc(vault)}`;
}

function userId(chainId: number, account: string): string {
  return `${chainId}-${lc(account)}`;
}

function vaultStateId(chainId: number, vault: string): string {
  return `${chainId}-${lc(vault)}`;
}

function assetMetaId(chainId: number, assetId: string): string {
  return `${chainId}-${lc(assetId)}`;
}

function chainPoolId(chainId: number, chainSelector: bigint): string {
  return `${chainId}-${chainSelector.toString()}`;
}

function positionId(chainId: number, account: string, bId: string): string {
  return `${chainId}-${lc(account)}-${bId}`;
}

function activityId(event: { chainId: number; block: { hash: string }; logIndex: number }): string {
  return `${event.chainId}-${lc(event.block.hash)}-${event.logIndex}`;
}

async function getOrCreateProtocolState(context: any, chainId: number, block: any): Promise<ProtocolState> {
  const id = `${PROTOCOL_STATE_PREFIX}-${chainId}`;
  const current = await context.ProtocolState.get(id);
  if (current) return current;

  const created: ProtocolState = {
    id,
    chainId,
    paused: false,
    updatedAt: ts(block),
    updatedBlock: bn(block),
  };
  context.ProtocolState.set(created);
  return created;
}

async function getOrCreateBasket(context: any, chainId: number, vault: string, block: any): Promise<Basket> {
  const id = basketId(chainId, vault);
  const current = await context.Basket.get(id);
  if (current) return current;

  const created: Basket = {
    id,
    chainId,
    creator: "0x0000000000000000000000000000000000000000",
    vault: lc(vault),
    shareToken: "0x0000000000000000000000000000000000000000",
    name: "",
    createdAt: ts(block),
    createdBlock: bn(block),
    assetCount: ZERO,
    depositFeeBps: ZERO,
    redeemFeeBps: ZERO,
    minReserveBps: ZERO,
    maxPerpAllocation: ZERO,
    usdcBalanceUsdc: ZERO,
    basketPrice: ZERO,
    sharePrice: ZERO,
    tvlBookUsdc: ZERO,
    perpAllocatedUsdc: ZERO,
    totalSupplyShares: ZERO,
    cumulativeDepositedUsdc: ZERO,
    cumulativeRedeemedUsdc: ZERO,
    totalDepositCount: ZERO,
    totalRedeemCount: ZERO,
    cumulativeTopUpUsdc: ZERO,
    cumulativeFeesCollectedUsdc: ZERO,
    updatedAt: ts(block),
    updatedBlock: bn(block),
  };
  context.Basket.set(created);
  return created;
}

async function refreshBasketFromChain(context: any, chainId: number, vault: string, block: any): Promise<Basket> {
  const lowerVault = lc(vault);
  const current = await getOrCreateBasket(context, chainId, lowerVault, block);
  const chainState = await readBasketChainState(chainId, lowerVault as Address);

  const updated: Basket = {
    ...current,
    name: chainState.name ?? current.name,
    shareToken: lc(chainState.shareToken ?? current.shareToken),
    perpAllocatedUsdc: chainState.perpAllocatedUsdc ?? current.perpAllocatedUsdc,
    sharePrice: chainState.sharePrice ?? current.sharePrice,
    basketPrice: chainState.basketPrice ?? current.basketPrice,
    assetCount: chainState.assetCount ?? current.assetCount,
    depositFeeBps: chainState.depositFeeBps ?? current.depositFeeBps,
    redeemFeeBps: chainState.redeemFeeBps ?? current.redeemFeeBps,
    minReserveBps: chainState.minReserveBps ?? current.minReserveBps,
    maxPerpAllocation: chainState.maxPerpAllocation ?? current.maxPerpAllocation,
    usdcBalanceUsdc: chainState.usdcBalanceUsdc ?? current.usdcBalanceUsdc,
    tvlBookUsdc: chainState.tvlBookUsdc ?? current.tvlBookUsdc,
    totalSupplyShares: chainState.totalSupplyShares ?? current.totalSupplyShares,
    updatedAt: ts(block),
    updatedBlock: bn(block),
  };

  context.Basket.set(updated);
  await syncBasketSnapshots(context, updated, block);
  return updated;
}

async function ensureVaultState(context: any, basket: Basket, chainId: number, block: any): Promise<VaultStateCurrent> {
  const id = vaultStateId(chainId, basket.vault);
  const existing = await context.VaultStateCurrent.get(id);
  if (existing) return existing;

  const protocol = await getOrCreateProtocolState(context, chainId, block);
  const created: VaultStateCurrent = {
    id,
    chainId,
    basket_id: basket.id,
    registered: false,
    paused: protocol.paused,
    depositedCapital: ZERO,
    realisedPnl: ZERO,
    openInterest: ZERO,
    positionCount: ZERO,
    collateralLocked: ZERO,
    updatedAt: ts(block),
    updatedBlock: bn(block),
  };
  context.VaultStateCurrent.set(created);
  return created;
}

async function syncVaultState(
  context: any,
  chainId: number,
  vaultAddress: string,
  vaultAccountingAddress: string,
  block: any,
): Promise<Basket> {
  const basket = await refreshBasketFromChain(context, chainId, vaultAddress, block);
  const currentState = await ensureVaultState(context, basket, chainId, block);
  const protocol = await getOrCreateProtocolState(context, chainId, block);
  const chainState = await readVaultAccountingState(
    chainId,
    lc(vaultAccountingAddress) as Address,
    lc(vaultAddress) as Address,
  );

  context.VaultStateCurrent.set({
    ...currentState,
    registered: chainState.registered ?? currentState.registered,
    paused: protocol.paused,
    depositedCapital: chainState.depositedCapital ?? currentState.depositedCapital,
    realisedPnl: chainState.realisedPnl ?? currentState.realisedPnl,
    openInterest: chainState.openInterest ?? currentState.openInterest,
    positionCount: chainState.positionCount ?? currentState.positionCount,
    collateralLocked: chainState.collateralLocked ?? currentState.collateralLocked,
    updatedAt: ts(block),
    updatedBlock: bn(block),
  });

  return basket;
}

async function getOrCreateUser(context: any, chainId: number, account: string, block: any): Promise<User> {
  const id = userId(chainId, account);
  const existing = await context.User.get(id);
  if (existing) {
    const updated = { ...existing, updatedAt: ts(block) };
    context.User.set(updated);
    return updated;
  }

  const created: User = {
    id,
    chainId,
    address: lc(account),
    createdAt: ts(block),
    updatedAt: ts(block),
  };
  context.User.set(created);
  return created;
}

async function getOrCreatePosition(
  context: any,
  chainId: number,
  user: User,
  basket: Basket,
  block: any,
): Promise<UserBasketPosition> {
  const id = positionId(chainId, user.address, basket.id);
  const existing = await context.UserBasketPosition.get(id);
  if (existing) return existing;

  const created: UserBasketPosition = {
    id,
    chainId,
    user_id: user.id,
    basket_id: basket.id,
    shareBalance: ZERO,
    netDepositedUsdc: ZERO,
    netRedeemedUsdc: ZERO,
    cumulativeDepositedUsdc: ZERO,
    cumulativeRedeemedUsdc: ZERO,
    lastActivityAt: ts(block),
    updatedAt: ts(block),
  };
  context.UserBasketPosition.set(created);
  return created;
}

async function createActivity(
  context: any,
  event: any,
  basket: Basket,
  activityType: string,
  values: Partial<Record<string, unknown>> = {},
) {
  context.BasketActivity.set({
    id: activityId(event),
    chainId: toInt(event.chainId),
    basket_id: basket.id,
    activityType,
    timestamp: ts(event.block),
    blockNumber: bn(event.block),
    txHash: lc(event.block.hash),
    logIndex: BigInt(event.logIndex),
    ...values,
  });
}

async function syncBasketSnapshot(
  context: any,
  basket: Basket,
  chainId: number,
  period: string,
  periodSeconds: bigint,
  block: any,
) {
  const bucketStart = (ts(block) / periodSeconds) * periodSeconds;
  const bucketEnd = bucketStart + periodSeconds - 1n;
  const id = `${basket.id}-${period}-${bucketStart.toString()}`;

  const existing = await context.BasketSnapshot.get(id);
  const createdAt = existing?.createdAt ?? ts(block);

  const chainState = await readBasketChainState(chainId, basket.vault as Address);
  const vaultAccountingAddress = chainState.vaultAccounting ?? "0x0000000000000000000000000000000000000000";
  const vaultState = vaultAccountingAddress === "0x0000000000000000000000000000000000000000"
    ? {}
    : await readVaultAccountingState(chainId, vaultAccountingAddress as Address, basket.vault as Address);

  context.BasketSnapshot.set({
    id,
    chainId,
    basket_id: basket.id,
    period,
    bucketStart,
    bucketEnd,
    createdAt,
    updatedAt: ts(block),
    sharePrice: basket.sharePrice,
    basketPrice: basket.basketPrice,
    usdcBalanceUsdc: basket.usdcBalanceUsdc,
    perpAllocatedUsdc: basket.perpAllocatedUsdc,
    tvlBookUsdc: basket.tvlBookUsdc,
    totalSupplyShares: basket.totalSupplyShares,
    assetCount: basket.assetCount,
    depositFeeBps: basket.depositFeeBps,
    redeemFeeBps: basket.redeemFeeBps,
    minReserveBps: basket.minReserveBps,
    requiredReserveUsdc: chainState.requiredReserveUsdc ?? ZERO,
    availableForPerpUsdc: chainState.availableForPerpUsdc ?? ZERO,
    collectedFeesUsdc: chainState.collectedFeesUsdc ?? ZERO,
    cumulativeFeesCollectedUsdc: basket.cumulativeFeesCollectedUsdc,
    openInterest: vaultState.openInterest ?? ZERO,
    collateralLocked: vaultState.collateralLocked ?? ZERO,
    positionCount: vaultState.positionCount ?? ZERO,
  });
}

async function syncBasketSnapshots(context: any, basket: Basket, block: any) {
  const chainId = basket.chainId;
  await syncBasketSnapshot(context, basket, chainId, SNAPSHOT_PERIOD_1D, DAY_SECONDS, block);
  await syncBasketSnapshot(context, basket, chainId, SNAPSHOT_PERIOD_7D, WEEK_SECONDS, block);
}

async function syncBasketAssets(context: any, chainId: number, vaultAddress: string, block: any) {
  const basket = await refreshBasketFromChain(context, chainId, vaultAddress, block);

  const previous = await context.BasketAsset.getWhere({
    basket_id: basket.id,
    active: true,
  });

  for (const row of previous) {
    context.BasketAsset.set({
      ...row,
      active: false,
      updatedAt: ts(block),
      updatedBlock: bn(block),
    });
  }

  const count = Number(basket.assetCount);
  for (let i = 0; i < count; i++) {
    const assetId = await readBasketAssetAt(chainId, lc(vaultAddress) as Address, BigInt(i));
    if (!assetId) continue;

    const id = `${basket.id}-${i}`;
    const existing = await context.BasketAsset.get(id);
    context.BasketAsset.set({
      id,
      chainId,
      basket_id: basket.id,
      assetId,
      active: true,
      updatedAt: ts(block),
      updatedBlock: bn(block),
      ...(existing ?? {}),
    });
  }
}

async function syncExposure(
  context: any,
  chainId: number,
  vaultAddress: string,
  assetId: string,
  isLong: boolean,
  vaultAccountingAddress: string,
  block: any,
) {
  const basket = await getOrCreateBasket(context, chainId, vaultAddress, block);
  const id = `${basket.id}-${lc(assetId)}`;

  const existing = (await context.BasketExposure.get(id)) as BasketExposure | undefined;
  const current: BasketExposure = existing ?? {
    id,
    chainId,
    basket_id: basket.id,
    assetId: lc(assetId),
    longSize: ZERO,
    shortSize: ZERO,
    netSize: ZERO,
    updatedAt: ts(block),
    updatedBlock: bn(block),
  };

  const size = await readPositionExposureSize(
    chainId,
    lc(vaultAccountingAddress) as Address,
    lc(vaultAddress) as Address,
    lc(assetId) as Address,
    isLong,
  );

  if (size === null) return;

  const next = {
    ...current,
    longSize: isLong ? size : current.longSize,
    shortSize: isLong ? current.shortSize : size,
    updatedAt: ts(block),
    updatedBlock: bn(block),
  };

  context.BasketExposure.set({
    ...next,
    netSize: next.longSize - next.shortSize,
  });
}

BasketFactory.BasketCreated.contractRegister(({ event, context }) => {
  context.addBasketVault(lc(event.params.vault));
});

BasketFactory.BasketCreated.handler(async ({ event, context }) => {
  const chainId = toInt(event.chainId);
  const vaultAddress = lc(event.params.vault);
  const basket = await refreshBasketFromChain(context, chainId, vaultAddress, event.block);

  context.Basket.set({
    ...basket,
    creator: lc(event.params.creator),
    vault: vaultAddress,
    shareToken: lc(event.params.shareToken),
    name: event.params.name,
    createdAt: ts(event.block),
    createdBlock: bn(event.block),
    updatedAt: ts(event.block),
    updatedBlock: bn(event.block),
  });

  await ensureVaultState(context, basket, chainId, event.block);

  try {
    await syncBasketAssets(context, chainId, vaultAddress, event.block);
  } catch (error) {
    console.error("BasketCreated syncBasketAssets failed", {
      chainId,
      vaultAddress,
      error: String(error),
    });
  }
});

BasketVault.Deposited.handler(async ({ event, context }) => {
  const chainId = toInt(event.chainId);
  const basket = await refreshBasketFromChain(context, chainId, event.srcAddress, event.block);

  context.Basket.set({
    ...basket,
    cumulativeDepositedUsdc: basket.cumulativeDepositedUsdc + event.params.usdcAmount,
    totalDepositCount: basket.totalDepositCount + 1n,
  });

  const user = await getOrCreateUser(context, chainId, event.params.user, event.block);
  const position = await getOrCreatePosition(context, chainId, user, basket, event.block);

  context.UserBasketPosition.set({
    ...position,
    shareBalance: position.shareBalance + event.params.sharesMinted,
    netDepositedUsdc: position.netDepositedUsdc + event.params.usdcAmount,
    cumulativeDepositedUsdc: position.cumulativeDepositedUsdc + event.params.usdcAmount,
    lastActivityAt: ts(event.block),
    updatedAt: ts(event.block),
  });

  await createActivity(context, event, basket, "deposit", {
    user_id: user.id,
    amountUsdc: event.params.usdcAmount,
    shares: event.params.sharesMinted,
  });
});

BasketVault.Redeemed.handler(async ({ event, context }) => {
  const chainId = toInt(event.chainId);
  const basket = await refreshBasketFromChain(context, chainId, event.srcAddress, event.block);

  context.Basket.set({
    ...basket,
    cumulativeRedeemedUsdc: basket.cumulativeRedeemedUsdc + event.params.usdcReturned,
    totalRedeemCount: basket.totalRedeemCount + 1n,
  });

  const user = await getOrCreateUser(context, chainId, event.params.user, event.block);
  const position = await getOrCreatePosition(context, chainId, user, basket, event.block);

  const nextBalance = position.shareBalance > event.params.sharesBurned
    ? position.shareBalance - event.params.sharesBurned
    : ZERO;

  context.UserBasketPosition.set({
    ...position,
    shareBalance: nextBalance,
    netRedeemedUsdc: position.netRedeemedUsdc + event.params.usdcReturned,
    cumulativeRedeemedUsdc: position.cumulativeRedeemedUsdc + event.params.usdcReturned,
    lastActivityAt: ts(event.block),
    updatedAt: ts(event.block),
  });

  await createActivity(context, event, basket, "redeem", {
    user_id: user.id,
    amountUsdc: event.params.usdcReturned,
    shares: event.params.sharesBurned,
  });
});

BasketVault.AllocatedToPerp.handler(async ({ event, context }) => {
  const basket = await refreshBasketFromChain(context, toInt(event.chainId), event.srcAddress, event.block);
  await createActivity(context, event, basket, "allocateToPerp", {
    amountUsdc: event.params.amount,
  });
});

BasketVault.WithdrawnFromPerp.handler(async ({ event, context }) => {
  const basket = await refreshBasketFromChain(context, toInt(event.chainId), event.srcAddress, event.block);
  await createActivity(context, event, basket, "withdrawFromPerp", {
    amountUsdc: event.params.amount,
  });
});

BasketVault.AssetsUpdated.handler(async ({ event, context }) => {
  const chainId = toInt(event.chainId);
  await syncBasketAssets(context, chainId, event.srcAddress, event.block);

  const basket = await getOrCreateBasket(context, chainId, event.srcAddress, event.block);
  await createActivity(context, event, basket, "assetsUpdated");
});

BasketVault.FeesCollected.handler(async ({ event, context }) => {
  const chainId = toInt(event.chainId);
  const basket = await refreshBasketFromChain(context, chainId, event.srcAddress, event.block);

  context.Basket.set({
    ...basket,
    cumulativeFeesCollectedUsdc: basket.cumulativeFeesCollectedUsdc + event.params.amount,
  });

  await createActivity(context, event, basket, "feesCollected", {
    amountUsdc: event.params.amount,
    recipient: lc(event.params.to),
  });
});

BasketVault.ReservePolicyUpdated.handler(async ({ event, context }) => {
  const chainId = toInt(event.chainId);
  const basket = await refreshBasketFromChain(context, chainId, event.srcAddress, event.block);

  context.Basket.set({
    ...basket,
    minReserveBps: event.params.minReserveBps,
  });

  await createActivity(context, event, basket, "reservePolicyUpdated", {
    amountUsdc: event.params.minReserveBps,
  });
});

BasketVault.ReserveToppedUp.handler(async ({ event, context }) => {
  const chainId = toInt(event.chainId);
  const basket = await refreshBasketFromChain(context, chainId, event.srcAddress, event.block);

  context.Basket.set({
    ...basket,
    cumulativeTopUpUsdc: basket.cumulativeTopUpUsdc + event.params.amount,
  });

  const user = await getOrCreateUser(context, chainId, event.params.from, event.block);
  await createActivity(context, event, basket, "reserveTopUp", {
    user_id: user.id,
    amountUsdc: event.params.amount,
  });
});

VaultAccounting.VaultRegistered.handler(async ({ event, context }) => {
  const basket = await syncVaultState(
    context,
    toInt(event.chainId),
    event.params.vault,
    event.srcAddress,
    event.block,
  );
  await createActivity(context, event, basket, "vaultRegistered");
});

VaultAccounting.VaultDeregistered.handler(async ({ event, context }) => {
  const basket = await syncVaultState(
    context,
    toInt(event.chainId),
    event.params.vault,
    event.srcAddress,
    event.block,
  );
  await createActivity(context, event, basket, "vaultDeregistered");
});

VaultAccounting.AssetTokenMapped.handler(async ({ event, context }) => {
  context.AssetTokenMapUpdate.set({
    id: activityId(event),
    chainId: toInt(event.chainId),
    assetId: lc(event.params.assetId),
    token: lc(event.params.token),
    blockNumber: bn(event.block),
    txHash: lc(event.block.hash),
    logIndex: BigInt(event.logIndex),
    createdAt: ts(event.block),
  });
});

VaultAccounting.CapitalDeposited.handler(async ({ event, context }) => {
  const basket = await syncVaultState(
    context,
    toInt(event.chainId),
    event.params.vault,
    event.srcAddress,
    event.block,
  );
  await createActivity(context, event, basket, "capitalDeposited", {
    amountUsdc: event.params.amount,
  });
});

VaultAccounting.CapitalWithdrawn.handler(async ({ event, context }) => {
  const basket = await syncVaultState(
    context,
    toInt(event.chainId),
    event.params.vault,
    event.srcAddress,
    event.block,
  );
  await createActivity(context, event, basket, "capitalWithdrawn", {
    amountUsdc: event.params.amount,
  });
});

VaultAccounting.PositionOpened.handler(async ({ event, context }) => {
  const chainId = toInt(event.chainId);
  const basket = await syncVaultState(
    context,
    chainId,
    event.params.vault,
    event.srcAddress,
    event.block,
  );

  await syncExposure(
    context,
    chainId,
    event.params.vault,
    event.params.asset,
    event.params.isLong,
    event.srcAddress,
    event.block,
  );

  await createActivity(context, event, basket, "positionOpened", {
    assetId: lc(event.params.asset),
    isLong: event.params.isLong,
    size: event.params.size,
    collateral: event.params.collateral,
  });
});

VaultAccounting.PositionClosed.handler(async ({ event, context }) => {
  const chainId = toInt(event.chainId);
  const basket = await syncVaultState(
    context,
    chainId,
    event.params.vault,
    event.srcAddress,
    event.block,
  );

  await syncExposure(
    context,
    chainId,
    event.params.vault,
    event.params.asset,
    event.params.isLong,
    event.srcAddress,
    event.block,
  );

  await createActivity(context, event, basket, "positionClosed", {
    assetId: lc(event.params.asset),
    isLong: event.params.isLong,
    pnl: event.params.realisedPnL,
  });
});

VaultAccounting.PnLRealized.handler(async ({ event, context }) => {
  const basket = await syncVaultState(
    context,
    toInt(event.chainId),
    event.params.vault,
    event.srcAddress,
    event.block,
  );
  await createActivity(context, event, basket, "pnlRealized", {
    pnl: event.params.amount,
  });
});

VaultAccounting.PauseToggled.handler(async ({ event, context }) => {
  const chainId = toInt(event.chainId);
  const current = await getOrCreateProtocolState(context, chainId, event.block);
  context.ProtocolState.set({
    ...current,
    paused: event.params.paused,
    updatedAt: ts(event.block),
    updatedBlock: bn(event.block),
  });
});

VaultAccounting.MaxOpenInterestSet.handler(async ({ event, context }) => {
  const basket = await getOrCreateBasket(context, toInt(event.chainId), event.params.vault, event.block);
  await createActivity(context, event, basket, "maxOpenInterestSet", {
    amountUsdc: event.params.cap,
  });
});

VaultAccounting.MaxPositionSizeSet.handler(async ({ event, context }) => {
  const basket = await getOrCreateBasket(context, toInt(event.chainId), event.params.vault, event.block);
  await createActivity(context, event, basket, "maxPositionSizeSet", {
    amountUsdc: event.params.cap,
  });
});

OracleAdapter.AssetConfigured.handler(async ({ event, context }) => {
  const chainId = toInt(event.chainId);
  const id = assetMetaId(chainId, event.params.assetId);
  const current = await context.AssetMeta.get(id);

  context.AssetMeta.set({
    id,
    chainId,
    assetId: lc(event.params.assetId),
    symbol: event.params.symbol,
    feedType: Number(event.params.feedType),
    feedAddress: lc(event.params.feedAddress),
    active: true,
    latestPrice: current?.latestPrice,
    latestPriceTimestamp: current?.latestPriceTimestamp,
    updatedAt: ts(event.block),
    updatedBlock: bn(event.block),
  });
});

OracleAdapter.AssetRemoved.handler(async ({ event, context }) => {
  const chainId = toInt(event.chainId);
  const id = assetMetaId(chainId, event.params.assetId);
  const current = await context.AssetMeta.get(id);

  context.AssetMeta.set({
    id,
    chainId,
    assetId: lc(event.params.assetId),
    symbol: current?.symbol,
    feedType: current?.feedType ?? 0,
    feedAddress: current?.feedAddress ?? "0x0000000000000000000000000000000000000000",
    active: false,
    latestPrice: current?.latestPrice,
    latestPriceTimestamp: current?.latestPriceTimestamp,
    updatedAt: ts(event.block),
    updatedBlock: bn(event.block),
  });
});

OracleAdapter.PriceUpdated.handler(async ({ event, context }) => {
  const chainId = toInt(event.chainId);
  const id = assetMetaId(chainId, event.params.assetId);
  const current = await context.AssetMeta.get(id);

  context.AssetMeta.set({
    id,
    chainId,
    assetId: lc(event.params.assetId),
    symbol: current?.symbol,
    feedType: current?.feedType ?? 0,
    feedAddress: current?.feedAddress ?? "0x0000000000000000000000000000000000000000",
    active: current?.active ?? true,
    latestPrice: event.params.price,
    latestPriceTimestamp: event.params.timestamp,
    updatedAt: ts(event.block),
    updatedBlock: bn(event.block),
  });

  context.OraclePriceUpdate.set({
    id: activityId(event),
    chainId,
    assetId: lc(event.params.assetId),
    price: event.params.price,
    priceTimestamp: event.params.timestamp,
    blockNumber: bn(event.block),
    txHash: lc(event.block.hash),
    logIndex: BigInt(event.logIndex),
    createdAt: ts(event.block),
  });
});

StateRelay.StateUpdated.handler(async ({ event, context }) => {
  const chainId = toInt(event.chainId);
  const routing = await readRoutingWeights(chainId, lc(event.srcAddress) as Address);
  if (!routing) return;

  for (let i = 0; i < routing.selectors.length; i++) {
    const selector = routing.selectors[i];
    const weight = routing.weights[i] ?? 0n;
    const amount = routing.amounts[i] ?? 0n;
    const id = chainPoolId(chainId, selector);

    const current = await context.ChainPoolState.get(id);
    context.ChainPoolState.set({
      id,
      chainId,
      chainSelector: selector,
      twapPoolAmount: weight,
      availableLiquidity: amount,
      reservedAmount: 0n,
      utilizationBps: 0n,
      snapshotTimestamp: event.params.timestamp,
      snapshotCount: (current?.snapshotCount ?? 0n) + 1n,
      updatedAt: ts(event.block),
    });
  }
});
