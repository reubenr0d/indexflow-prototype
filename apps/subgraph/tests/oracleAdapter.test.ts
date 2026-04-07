import { Address, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts";
import {
  afterAll,
  assert,
  beforeAll,
  clearStore,
  describe,
  test,
} from "matchstick-as/assembly/index";
import { newMockEvent } from "matchstick-as/assembly/defaults";
import { handleAssetConfigured, handleAssetRemoved, handlePriceUpdated } from "../src/mappings/oracleAdapter";
import { AssetConfigured, AssetRemoved, PriceUpdated } from "../generated/OracleAdapter/OracleAdapter";

function createAssetConfigured(assetId: Bytes, feedType: i32, feedAddress: Address): AssetConfigured {
  const mock = changetype<AssetConfigured>(newMockEvent());
  mock.parameters = new Array();
  mock.parameters.push(new ethereum.EventParam("assetId", ethereum.Value.fromFixedBytes(assetId)));
  mock.parameters.push(new ethereum.EventParam("feedType", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(feedType))));
  mock.parameters.push(new ethereum.EventParam("feedAddress", ethereum.Value.fromAddress(feedAddress)));
  return mock;
}

function createAssetRemoved(assetId: Bytes): AssetRemoved {
  const mock = changetype<AssetRemoved>(newMockEvent());
  mock.parameters = new Array();
  mock.parameters.push(new ethereum.EventParam("assetId", ethereum.Value.fromFixedBytes(assetId)));
  return mock;
}

function createPriceUpdated(assetId: Bytes, price: BigInt, timestamp: BigInt): PriceUpdated {
  const mock = changetype<PriceUpdated>(newMockEvent());
  mock.parameters = new Array();
  mock.parameters.push(new ethereum.EventParam("assetId", ethereum.Value.fromFixedBytes(assetId)));
  mock.parameters.push(new ethereum.EventParam("price", ethereum.Value.fromUnsignedBigInt(price)));
  mock.parameters.push(new ethereum.EventParam("timestamp", ethereum.Value.fromUnsignedBigInt(timestamp)));
  mock.transaction.hash = Bytes.fromHexString("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  mock.logIndex = BigInt.fromI32(3);
  return mock;
}

describe("OracleAdapter mappings", () => {
  beforeAll(() => {
    const assetId = Bytes.fromHexString("0x1111111111111111111111111111111111111111111111111111111111111111") as Bytes;
    const feedAddress = Address.fromString("0x1111111111111111111111111111111111111111");

    handleAssetConfigured(createAssetConfigured(assetId, 1, feedAddress));
    handlePriceUpdated(createPriceUpdated(assetId, BigInt.fromString("123450000"), BigInt.fromI32(1710000000)));
    handleAssetRemoved(createAssetRemoved(assetId));
  });

  afterAll(() => {
    clearStore();
  });

  test("updates AssetMeta lifecycle", () => {
    const id = "0x1111111111111111111111111111111111111111111111111111111111111111";
    assert.entityCount("AssetMeta", 1);
    assert.fieldEquals("AssetMeta", id, "feedType", "1");
    assert.fieldEquals("AssetMeta", id, "active", "false");
    assert.fieldEquals("AssetMeta", id, "latestPrice", "123450000");
    assert.fieldEquals("AssetMeta", id, "latestPriceTimestamp", "1710000000");
  });

  test("persists immutable OraclePriceUpdate rows", () => {
    const id = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-3";
    assert.entityCount("OraclePriceUpdate", 1);
    assert.fieldEquals("OraclePriceUpdate", id, "assetId", "0x1111111111111111111111111111111111111111111111111111111111111111");
    assert.fieldEquals("OraclePriceUpdate", id, "price", "123450000");
    assert.fieldEquals("OraclePriceUpdate", id, "priceTimestamp", "1710000000");
    assert.fieldEquals("OraclePriceUpdate", id, "txHash", "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    assert.fieldEquals("OraclePriceUpdate", id, "logIndex", "3");
  });
});
