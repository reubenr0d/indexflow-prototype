import { BigInt } from "@graphprotocol/graph-ts";
import {
  IntentSubmitted,
  IntentExecuted,
  IntentRefunded,
} from "../../generated/IntentRouter/IntentRouter";
import { IntentAction, IntentStats } from "../../generated/schema";

function getOrCreateIntentStats(): IntentStats {
  let stats = IntentStats.load("singleton");
  if (stats == null) {
    stats = new IntentStats("singleton");
    stats.totalSubmitted = BigInt.zero();
    stats.totalExecuted = BigInt.zero();
    stats.totalRefunded = BigInt.zero();
    stats.cumulativeVolumeUsdc = BigInt.zero();
    stats.updatedAt = BigInt.zero();
  }
  return stats as IntentStats;
}

export function handleIntentSubmitted(event: IntentSubmitted): void {
  const entityId = event.transaction.hash.toHexString().concat("-").concat(event.logIndex.toString());

  const action = new IntentAction(entityId);
  action.intentId = event.params.id;
  action.user = event.params.user;
  action.intentType = event.params.intentType == 0 ? "DEPOSIT" : "REDEEM";
  action.status = "SUBMITTED";
  action.amount = event.params.amount;
  action.timestamp = event.block.timestamp;
  action.blockNumber = event.block.number;
  action.txHash = event.transaction.hash;
  action.logIndex = event.logIndex;
  action.save();

  const stats = getOrCreateIntentStats();
  stats.totalSubmitted = stats.totalSubmitted.plus(BigInt.fromI32(1));
  stats.cumulativeVolumeUsdc = stats.cumulativeVolumeUsdc.plus(event.params.amount);
  stats.updatedAt = event.block.timestamp;
  stats.save();
}

export function handleIntentExecuted(event: IntentExecuted): void {
  const entityId = event.transaction.hash.toHexString().concat("-").concat(event.logIndex.toString());

  const action = new IntentAction(entityId);
  action.intentId = event.params.id;
  action.user = event.params.basketVault;
  action.intentType = "DEPOSIT";
  action.status = "EXECUTED";
  action.amount = event.params.sharesOrUsdc;
  action.basketVault = event.params.basketVault;
  action.sharesOrUsdc = event.params.sharesOrUsdc;
  action.timestamp = event.block.timestamp;
  action.blockNumber = event.block.number;
  action.txHash = event.transaction.hash;
  action.logIndex = event.logIndex;
  action.save();

  const stats = getOrCreateIntentStats();
  stats.totalExecuted = stats.totalExecuted.plus(BigInt.fromI32(1));
  stats.updatedAt = event.block.timestamp;
  stats.save();
}

export function handleIntentRefunded(event: IntentRefunded): void {
  const entityId = event.transaction.hash.toHexString().concat("-").concat(event.logIndex.toString());

  const action = new IntentAction(entityId);
  action.intentId = event.params.id;
  action.user = event.params.user;
  action.intentType = "DEPOSIT";
  action.status = "REFUNDED";
  action.amount = event.params.amount;
  action.timestamp = event.block.timestamp;
  action.blockNumber = event.block.number;
  action.txHash = event.transaction.hash;
  action.logIndex = event.logIndex;
  action.save();

  const stats = getOrCreateIntentStats();
  stats.totalRefunded = stats.totalRefunded.plus(BigInt.fromI32(1));
  stats.updatedAt = event.block.timestamp;
  stats.save();
}
