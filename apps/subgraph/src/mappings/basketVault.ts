import { BigInt } from "@graphprotocol/graph-ts";
import {
  AllocatedToPerp,
  AssetsUpdated,
  Deposited,
  FeesCollected,
  Redeemed,
  ReservePolicyUpdated,
  ReserveToppedUp,
  WithdrawnFromPerp,
} from "../../generated/templates/BasketVaultTemplate/BasketVault";
import {
  createActivity,
  getOrCreateBasket,
  getOrCreateUser,
  getOrCreateUserBasketPosition,
  refreshBasketFromChain,
  syncBasketAssets,
  ZERO,
} from "./helpers";

const ONE = BigInt.fromI32(1);

export function handleDeposited(event: Deposited): void {
  const basket = refreshBasketFromChain(event.address, event);
  basket.cumulativeDepositedUsdc = basket.cumulativeDepositedUsdc.plus(event.params.usdcAmount);
  basket.totalDepositCount = basket.totalDepositCount.plus(ONE);
  basket.save();

  const user = getOrCreateUser(event.params.user, event);
  const position = getOrCreateUserBasketPosition(user, basket, event);
  position.shareBalance = position.shareBalance.plus(event.params.sharesMinted);
  position.netDepositedUsdc = position.netDepositedUsdc.plus(event.params.usdcAmount);
  position.cumulativeDepositedUsdc = position.cumulativeDepositedUsdc.plus(event.params.usdcAmount);
  position.lastActivityAt = event.block.timestamp;
  position.updatedAt = event.block.timestamp;
  position.save();

  const activity = createActivity(event, basket, "deposit");
  activity.user = user.id;
  activity.amountUsdc = event.params.usdcAmount;
  activity.shares = event.params.sharesMinted;
  activity.save();
}

export function handleRedeemed(event: Redeemed): void {
  const basket = refreshBasketFromChain(event.address, event);
  basket.cumulativeRedeemedUsdc = basket.cumulativeRedeemedUsdc.plus(event.params.usdcReturned);
  basket.totalRedeemCount = basket.totalRedeemCount.plus(ONE);
  basket.save();

  const user = getOrCreateUser(event.params.user, event);
  const position = getOrCreateUserBasketPosition(user, basket, event);
  if (position.shareBalance.gt(event.params.sharesBurned)) {
    position.shareBalance = position.shareBalance.minus(event.params.sharesBurned);
  } else {
    position.shareBalance = ZERO;
  }
  position.netRedeemedUsdc = position.netRedeemedUsdc.plus(event.params.usdcReturned);
  position.cumulativeRedeemedUsdc = position.cumulativeRedeemedUsdc.plus(event.params.usdcReturned);
  position.lastActivityAt = event.block.timestamp;
  position.updatedAt = event.block.timestamp;
  position.save();

  const activity = createActivity(event, basket, "redeem");
  activity.user = user.id;
  activity.amountUsdc = event.params.usdcReturned;
  activity.shares = event.params.sharesBurned;
  activity.save();
}

export function handleAllocatedToPerp(event: AllocatedToPerp): void {
  const basket = refreshBasketFromChain(event.address, event);
  const activity = createActivity(event, basket, "allocateToPerp");
  activity.amountUsdc = event.params.amount;
  activity.save();
}

export function handleWithdrawnFromPerp(event: WithdrawnFromPerp): void {
  const basket = refreshBasketFromChain(event.address, event);
  const activity = createActivity(event, basket, "withdrawFromPerp");
  activity.amountUsdc = event.params.amount;
  activity.save();
}

export function handleAssetsUpdated(event: AssetsUpdated): void {
  syncBasketAssets(event.address, event);

  const basket = getOrCreateBasket(event.address, event);
  const activity = createActivity(event, basket, "assetsUpdated");
  activity.save();
}

export function handleFeesCollected(event: FeesCollected): void {
  const basket = refreshBasketFromChain(event.address, event);
  basket.cumulativeFeesCollectedUsdc = basket.cumulativeFeesCollectedUsdc.plus(event.params.amount);
  basket.save();

  const activity = createActivity(event, basket, "feesCollected");
  activity.amountUsdc = event.params.amount;
  activity.recipient = event.params.to;
  activity.save();
}

export function handleReservePolicyUpdated(event: ReservePolicyUpdated): void {
  const basket = refreshBasketFromChain(event.address, event);
  basket.minReserveBps = event.params.minReserveBps;
  basket.save();

  const activity = createActivity(event, basket, "reservePolicyUpdated");
  activity.amountUsdc = event.params.minReserveBps;
  activity.save();
}

export function handleReserveToppedUp(event: ReserveToppedUp): void {
  const basket = refreshBasketFromChain(event.address, event);
  basket.cumulativeTopUpUsdc = basket.cumulativeTopUpUsdc.plus(event.params.amount);
  basket.save();

  const user = getOrCreateUser(event.params.from, event);
  const activity = createActivity(event, basket, "reserveTopUp");
  activity.user = user.id;
  activity.amountUsdc = event.params.amount;
  activity.save();
}
