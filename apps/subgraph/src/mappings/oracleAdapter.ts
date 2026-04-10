import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  AssetConfigured,
  AssetRemoved,
  PriceUpdated,
} from "../../generated/OracleAdapter/OracleAdapter";
import { AssetMeta, OraclePriceUpdate } from "../../generated/schema";

function getOrCreateAssetMeta(assetId: Bytes, blockTimestamp: BigInt, blockNumber: BigInt): AssetMeta {
  let meta = AssetMeta.load(assetId.toHexString());
  if (meta == null) {
    meta = new AssetMeta(assetId.toHexString());
    meta.assetId = assetId;
    meta.feedType = 0;
    meta.feedAddress = Address.zero();
    meta.active = false;
    meta.updatedAt = blockTimestamp;
    meta.updatedBlock = blockNumber;
  }
  return meta as AssetMeta;
}

export function handleAssetConfigured(event: AssetConfigured): void {
  const meta = getOrCreateAssetMeta(event.params.assetId, event.block.timestamp, event.block.number);
  meta.symbol = event.params.symbol;
  meta.feedType = event.params.feedType;
  meta.feedAddress = event.params.feedAddress;
  meta.active = true;
  meta.updatedAt = event.block.timestamp;
  meta.updatedBlock = event.block.number;
  meta.save();
}

export function handleAssetRemoved(event: AssetRemoved): void {
  const meta = getOrCreateAssetMeta(event.params.assetId, event.block.timestamp, event.block.number);
  meta.active = false;
  meta.updatedAt = event.block.timestamp;
  meta.updatedBlock = event.block.number;
  meta.save();
}

export function handlePriceUpdated(event: PriceUpdated): void {
  const meta = getOrCreateAssetMeta(event.params.assetId, event.block.timestamp, event.block.number);
  meta.latestPrice = event.params.price;
  meta.latestPriceTimestamp = event.params.timestamp;
  meta.updatedAt = event.block.timestamp;
  meta.updatedBlock = event.block.number;
  meta.save();

  const updateId = event.transaction.hash.toHexString().concat("-").concat(event.logIndex.toString());
  const update = new OraclePriceUpdate(updateId);
  update.assetId = event.params.assetId;
  update.price = event.params.price;
  update.priceTimestamp = event.params.timestamp;
  update.blockNumber = event.block.number;
  update.txHash = event.transaction.hash;
  update.logIndex = event.logIndex;
  update.createdAt = event.block.timestamp;
  update.save();
}
