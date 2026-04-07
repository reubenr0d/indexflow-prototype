import { Address, Bytes, ethereum } from "@graphprotocol/graph-ts";
import {
  AssetTokenMapped,
  CapitalDeposited,
  CapitalWithdrawn,
  MaxOpenInterestSet,
  MaxPositionSizeSet,
  PauseToggled,
  PnLRealized,
  PositionClosed,
  PositionOpened,
  VaultAccounting,
  VaultDeregistered,
  VaultRegistered,
} from "../../generated/VaultAccounting/VaultAccounting";
import {
  createActivity,
  ensureVaultState,
  getOrCreateBasketExposure,
  getOrCreateBasket,
  getOrCreateProtocolState,
  refreshBasketFromChain,
  ZERO,
} from "./helpers";
import { AssetTokenMapUpdate } from "../../generated/schema";

function syncVaultState(vault: Address, contractAddress: Address, event: ethereum.Event): void {
  const basket = refreshBasketFromChain(vault, event);

  const stateEntity = ensureVaultState(basket, event);
  const contract = VaultAccounting.bind(contractAddress);
  const stateCall = contract.try_getVaultState(vault);

  if (!stateCall.reverted) {
    stateEntity.depositedCapital = stateCall.value.depositedCapital;
    stateEntity.realisedPnl = stateCall.value.realisedPnL;
    stateEntity.openInterest = stateCall.value.openInterest;
    stateEntity.positionCount = stateCall.value.positionCount;
    stateEntity.collateralLocked = stateCall.value.collateralLocked;
    stateEntity.registered = stateCall.value.registered;
  }

  stateEntity.paused = getOrCreateProtocolState(event).paused;
  stateEntity.updatedAt = event.block.timestamp;
  stateEntity.updatedBlock = event.block.number;
  stateEntity.save();
}

function syncExposure(vault: Address, asset: Bytes, isLong: boolean, contractAddress: Address, event: ethereum.Event): void {
  const basket = getOrCreateBasket(vault, event);
  const contract = VaultAccounting.bind(contractAddress);
  const keyCall = contract.try_getPositionKey(vault, asset, isLong);
  if (keyCall.reverted) return;

  const trackingCall = contract.try_getPositionTracking(keyCall.value);
  if (trackingCall.reverted) return;

  const exposure = getOrCreateBasketExposure(basket, asset, event);
  const size = trackingCall.value.exists ? trackingCall.value.size : ZERO;

  if (isLong) {
    exposure.longSize = size;
  } else {
    exposure.shortSize = size;
  }
  exposure.netSize = exposure.longSize.minus(exposure.shortSize);
  exposure.updatedAt = event.block.timestamp;
  exposure.updatedBlock = event.block.number;
  exposure.save();
}

export function handleVaultRegistered(event: VaultRegistered): void {
  syncVaultState(event.params.vault, event.address, event);

  const basket = getOrCreateBasket(event.params.vault, event);
  const activity = createActivity(event, basket, "vaultRegistered");
  activity.save();
}

export function handleVaultDeregistered(event: VaultDeregistered): void {
  syncVaultState(event.params.vault, event.address, event);

  const basket = getOrCreateBasket(event.params.vault, event);
  const activity = createActivity(event, basket, "vaultDeregistered");
  activity.save();
}

export function handleAssetTokenMapped(event: AssetTokenMapped): void {
  const updateId = event.transaction.hash.toHexString().concat("-").concat(event.logIndex.toString());
  const update = new AssetTokenMapUpdate(updateId);
  update.assetId = event.params.assetId;
  update.token = event.params.token;
  update.blockNumber = event.block.number;
  update.txHash = event.transaction.hash;
  update.logIndex = event.logIndex;
  update.createdAt = event.block.timestamp;
  update.save();
}

export function handleCapitalDeposited(event: CapitalDeposited): void {
  syncVaultState(event.params.vault, event.address, event);

  const basket = getOrCreateBasket(event.params.vault, event);
  const activity = createActivity(event, basket, "capitalDeposited");
  activity.amountUsdc = event.params.amount;
  activity.save();
}

export function handleCapitalWithdrawn(event: CapitalWithdrawn): void {
  syncVaultState(event.params.vault, event.address, event);

  const basket = getOrCreateBasket(event.params.vault, event);
  const activity = createActivity(event, basket, "capitalWithdrawn");
  activity.amountUsdc = event.params.amount;
  activity.save();
}

export function handlePositionOpened(event: PositionOpened): void {
  syncVaultState(event.params.vault, event.address, event);
  syncExposure(event.params.vault, event.params.asset, event.params.isLong, event.address, event);

  const basket = getOrCreateBasket(event.params.vault, event);
  const activity = createActivity(event, basket, "positionOpened");
  activity.assetId = event.params.asset;
  activity.isLong = event.params.isLong;
  activity.size = event.params.size;
  activity.collateral = event.params.collateral;
  activity.save();
}

export function handlePositionClosed(event: PositionClosed): void {
  syncVaultState(event.params.vault, event.address, event);
  syncExposure(event.params.vault, event.params.asset, event.params.isLong, event.address, event);

  const basket = getOrCreateBasket(event.params.vault, event);
  const activity = createActivity(event, basket, "positionClosed");
  activity.assetId = event.params.asset;
  activity.isLong = event.params.isLong;
  activity.pnl = event.params.realisedPnL;
  activity.save();
}

export function handlePnlRealized(event: PnLRealized): void {
  syncVaultState(event.params.vault, event.address, event);

  const basket = getOrCreateBasket(event.params.vault, event);
  const activity = createActivity(event, basket, "pnlRealized");
  activity.pnl = event.params.amount;
  activity.save();
}

export function handlePauseToggled(event: PauseToggled): void {
  const protocol = getOrCreateProtocolState(event);
  protocol.paused = event.params.paused;
  protocol.updatedAt = event.block.timestamp;
  protocol.updatedBlock = event.block.number;
  protocol.save();
}

export function handleMaxOpenInterestSet(event: MaxOpenInterestSet): void {
  const basket = getOrCreateBasket(event.params.vault, event);
  const activity = createActivity(event, basket, "maxOpenInterestSet");
  activity.amountUsdc = event.params.cap;
  activity.save();
}

export function handleMaxPositionSizeSet(event: MaxPositionSizeSet): void {
  const basket = getOrCreateBasket(event.params.vault, event);
  const activity = createActivity(event, basket, "maxPositionSizeSet");
  activity.amountUsdc = event.params.cap;
  activity.save();
}
