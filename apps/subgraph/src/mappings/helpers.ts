import { Address, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts";
import {
  Basket,
  BasketActivity,
  BasketAsset,
  BasketExposure,
  ProtocolState,
  User,
  UserBasketPosition,
  VaultStateCurrent,
} from "../../generated/schema";
import { BasketVault as BasketVaultContract } from "../../generated/BasketFactory/BasketVault";
import { BasketShareToken as BasketShareTokenContract } from "../../generated/BasketFactory/BasketShareToken";
import { ERC20 as ERC20Contract } from "../../generated/BasketFactory/ERC20";

export const ZERO = BigInt.zero();
const PROTOCOL_STATE_ID = "protocol";

export function activityId(event: ethereum.Event): string {
  return event.transaction.hash.toHexString().concat("-").concat(event.logIndex.toString());
}

export function getOrCreateProtocolState(event: ethereum.Event): ProtocolState {
  let state = ProtocolState.load(PROTOCOL_STATE_ID);
  if (state == null) {
    state = new ProtocolState(PROTOCOL_STATE_ID);
    state.paused = false;
    state.updatedAt = event.block.timestamp;
    state.updatedBlock = event.block.number;
    state.save();
  }
  return state as ProtocolState;
}

export function getOrCreateBasket(vault: Address, event: ethereum.Event): Basket {
  let basket = Basket.load(vault.toHexString());
  if (basket == null) {
    basket = new Basket(vault.toHexString());
    basket.creator = Address.zero();
    basket.vault = vault;
    basket.shareToken = Address.zero();
    basket.name = "";
    basket.createdAt = event.block.timestamp;
    basket.createdBlock = event.block.number;
    basket.assetCount = ZERO;
    basket.depositFeeBps = ZERO;
    basket.redeemFeeBps = ZERO;
    basket.minReserveBps = ZERO;
    basket.maxPerpAllocation = ZERO;
    basket.usdcBalanceUsdc = ZERO;
    basket.basketPrice = ZERO;
    basket.sharePrice = ZERO;
    basket.tvlBookUsdc = ZERO;
    basket.perpAllocatedUsdc = ZERO;
    basket.totalSupplyShares = ZERO;
    basket.cumulativeDepositedUsdc = ZERO;
    basket.cumulativeRedeemedUsdc = ZERO;
    basket.totalDepositCount = ZERO;
    basket.totalRedeemCount = ZERO;
    basket.cumulativeTopUpUsdc = ZERO;
    basket.cumulativeFeesCollectedUsdc = ZERO;
    basket.updatedAt = event.block.timestamp;
    basket.updatedBlock = event.block.number;
  }
  return basket as Basket;
}

export function refreshBasketFromChain(vault: Address, event: ethereum.Event): Basket {
  let basket = getOrCreateBasket(vault, event);
  const contract = BasketVaultContract.bind(vault);

  const nameCall = contract.try_name();
  if (!nameCall.reverted) basket.name = nameCall.value;

  const shareTokenCall = contract.try_shareToken();
  if (!shareTokenCall.reverted) {
    basket.shareToken = shareTokenCall.value;

    const supply = BasketShareTokenContract.bind(shareTokenCall.value).try_totalSupply();
    if (!supply.reverted) basket.totalSupplyShares = supply.value;
  }

  const perpCall = contract.try_perpAllocated();
  if (!perpCall.reverted) basket.perpAllocatedUsdc = perpCall.value;

  const sharePriceCall = contract.try_getSharePrice();
  if (!sharePriceCall.reverted) {
    basket.sharePrice = sharePriceCall.value;
    basket.basketPrice = sharePriceCall.value;
  }

  const assetCountCall = contract.try_getAssetCount();
  if (!assetCountCall.reverted) basket.assetCount = assetCountCall.value;

  const depFeeCall = contract.try_depositFeeBps();
  if (!depFeeCall.reverted) basket.depositFeeBps = depFeeCall.value;

  const redFeeCall = contract.try_redeemFeeBps();
  if (!redFeeCall.reverted) basket.redeemFeeBps = redFeeCall.value;

  const reserveCall = contract.try_minReserveBps();
  if (!reserveCall.reverted) basket.minReserveBps = reserveCall.value;

  const maxPerpCall = contract.try_maxPerpAllocation();
  if (!maxPerpCall.reverted) basket.maxPerpAllocation = maxPerpCall.value;

  const usdcCall = contract.try_usdc();
  if (!usdcCall.reverted) {
    const usdcBalanceCall = ERC20Contract.bind(usdcCall.value).try_balanceOf(vault);
    if (!usdcBalanceCall.reverted) {
      basket.usdcBalanceUsdc = usdcBalanceCall.value;
      basket.tvlBookUsdc = usdcBalanceCall.value.plus(basket.perpAllocatedUsdc);
    }
  }

  basket.updatedAt = event.block.timestamp;
  basket.updatedBlock = event.block.number;
  basket.save();
  return basket;
}

export function syncBasketAssets(vault: Address, event: ethereum.Event): void {
  const basket = refreshBasketFromChain(vault, event);
  const contract = BasketVaultContract.bind(vault);

  for (let i = 0; i < 256; i++) {
    const id = basket.id.concat("-").concat(i.toString());
    const oldAsset = BasketAsset.load(id);
    if (oldAsset == null) break;
    oldAsset.active = false;
    oldAsset.updatedAt = event.block.timestamp;
    oldAsset.updatedBlock = event.block.number;
    oldAsset.save();
  }

  const count = basket.assetCount.toI32();
  for (let i = 0; i < count; i++) {
    const data = contract.try_getAssetAt(BigInt.fromI32(i));
    if (data.reverted) continue;

    const entityId = basket.id.concat("-").concat(i.toString());
    let asset = BasketAsset.load(entityId);
    if (asset == null) {
      asset = new BasketAsset(entityId);
      asset.basket = basket.id;
    }

    asset.assetId = data.value as Bytes;
    asset.active = true;
    asset.updatedAt = event.block.timestamp;
    asset.updatedBlock = event.block.number;
    asset.save();
  }
}

export function getOrCreateBasketExposure(basket: Basket, assetId: Bytes, event: ethereum.Event): BasketExposure {
  const id = basket.id.concat("-").concat(assetId.toHexString().toLowerCase());
  let exposure = BasketExposure.load(id);
  if (exposure == null) {
    exposure = new BasketExposure(id);
    exposure.basket = basket.id;
    exposure.assetId = assetId;
    exposure.longSize = ZERO;
    exposure.shortSize = ZERO;
    exposure.netSize = ZERO;
    exposure.updatedAt = event.block.timestamp;
    exposure.updatedBlock = event.block.number;
  }
  return exposure as BasketExposure;
}

export function getOrCreateUser(account: Address, event: ethereum.Event): User {
  let user = User.load(account.toHexString());
  if (user == null) {
    user = new User(account.toHexString());
    user.address = account;
    user.createdAt = event.block.timestamp;
    user.updatedAt = event.block.timestamp;
  }
  user.updatedAt = event.block.timestamp;
  user.save();
  return user as User;
}

export function getOrCreateUserBasketPosition(user: User, basket: Basket, event: ethereum.Event): UserBasketPosition {
  const id = user.id.concat("-").concat(basket.id);
  let position = UserBasketPosition.load(id);
  if (position == null) {
    position = new UserBasketPosition(id);
    position.user = user.id;
    position.basket = basket.id;
    position.shareBalance = ZERO;
    position.netDepositedUsdc = ZERO;
    position.netRedeemedUsdc = ZERO;
    position.cumulativeDepositedUsdc = ZERO;
    position.cumulativeRedeemedUsdc = ZERO;
    position.lastActivityAt = event.block.timestamp;
    position.updatedAt = event.block.timestamp;
  }
  return position as UserBasketPosition;
}

export function createActivity(event: ethereum.Event, basket: Basket, activityType: string): BasketActivity {
  const activity = new BasketActivity(activityId(event));
  activity.basket = basket.id;
  activity.activityType = activityType;
  activity.timestamp = event.block.timestamp;
  activity.blockNumber = event.block.number;
  activity.txHash = event.transaction.hash;
  activity.logIndex = event.logIndex;
  return activity;
}

export function ensureVaultState(basket: Basket, event: ethereum.Event): VaultStateCurrent {
  let state = VaultStateCurrent.load(basket.id);
  if (state == null) {
    state = new VaultStateCurrent(basket.id);
    state.basket = basket.id;
    state.registered = false;
    state.paused = getOrCreateProtocolState(event).paused;
    state.depositedCapital = ZERO;
    state.realisedPnl = ZERO;
    state.openInterest = ZERO;
    state.positionCount = ZERO;
    state.collateralLocked = ZERO;
    state.updatedAt = event.block.timestamp;
    state.updatedBlock = event.block.number;
  }
  return state as VaultStateCurrent;
}
