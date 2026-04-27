import { gql } from "graphql-request";
import { ENVIO_UNIFIED_URL } from "@/config/subgraphs";
import {
  ENVIO_GET_BASKETS_OVERVIEW,
  ENVIO_GET_BASKET_DETAIL,
  ENVIO_GET_BASKET_TREND_SNAPSHOTS,
  ENVIO_GET_BASKETS_WEEK_SNAPSHOTS,
  ENVIO_GET_SHARE_PRICE_HISTORY,
  ENVIO_GET_BASKET_ACTIVITIES,
  ENVIO_GET_USER_PORTFOLIO,
  ENVIO_GET_TOKEN_HOLDER_ADDRESSES,
  ENVIO_GET_ADMIN_VAULT_STATES,
  ENVIO_GET_ORACLE_PRICE_UPDATES,
  ENVIO_GET_CHAIN_POOL_STATES,
} from "./envio-queries";

const isEnvioMode = ENVIO_UNIFIED_URL.length > 0;

const GRAPH_GET_BASKETS_OVERVIEW = gql`
  query GetBasketsOverview($first: Int!, $skip: Int!, $chainId: Int!) {
    baskets(
      first: $first
      skip: $skip
      where: { chainId: $chainId }
      orderBy: updatedAt
      orderDirection: desc
    ) {
      id
      chainId
      name
      vault
      shareToken
      assetCount
      basketPrice
      sharePrice
      usdcBalanceUsdc
      perpAllocatedUsdc
      tvlBookUsdc
      totalSupplyShares
      depositFeeBps
      redeemFeeBps
      createdAt
      updatedAt
    }
  }
`;

const GRAPH_GET_BASKET_DETAIL = gql`
  query GetBasketDetail($id: ID!, $activityFirst: Int!, $activitySkip: Int!) {
    basket(id: $id) {
      id
      name
      vault
      shareToken
      assetCount
      basketPrice
      sharePrice
      usdcBalanceUsdc
      perpAllocatedUsdc
      tvlBookUsdc
      totalSupplyShares
      depositFeeBps
      redeemFeeBps
      minReserveBps
      maxPerpAllocation
      exposures(orderBy: netSize, orderDirection: desc) {
        id
        assetId
        longSize
        shortSize
        netSize
        updatedAt
      }
      assets(where: { active: true }, orderBy: updatedAt, orderDirection: desc) {
        id
        assetId
        active
        updatedAt
      }
      activities(first: $activityFirst, skip: $activitySkip, orderBy: timestamp, orderDirection: desc) {
        id
        activityType
        user {
          id
        }
        assetId
        isLong
        amountUsdc
        shares
        size
        collateral
        pnl
        recipient
        timestamp
        txHash
      }
    }
    vaultStateCurrent(id: $id) {
      id
      registered
      paused
      depositedCapital
      realisedPnl
      openInterest
      positionCount
      collateralLocked
      updatedAt
    }
  }
`;

const GRAPH_GET_BASKET_TREND_SNAPSHOTS = gql`
  query GetBasketTrendSnapshots($id: ID!) {
    daySnapshots: basketSnapshots(
      where: { basket_: { id: $id }, period: "1d" }
      first: 2
      orderBy: bucketStart
      orderDirection: desc
    ) {
      id
      period
      bucketStart
      bucketEnd
      createdAt
      updatedAt
      sharePrice
      basketPrice
      usdcBalanceUsdc
      perpAllocatedUsdc
      tvlBookUsdc
      totalSupplyShares
      assetCount
      depositFeeBps
      redeemFeeBps
      minReserveBps
      requiredReserveUsdc
      availableForPerpUsdc
      collectedFeesUsdc
      cumulativeFeesCollectedUsdc
      openInterest
      collateralLocked
      positionCount
    }
    weekSnapshots: basketSnapshots(
      where: { basket_: { id: $id }, period: "7d" }
      first: 2
      orderBy: bucketStart
      orderDirection: desc
    ) {
      id
      period
      bucketStart
      bucketEnd
      createdAt
      updatedAt
      sharePrice
      basketPrice
      usdcBalanceUsdc
      perpAllocatedUsdc
      tvlBookUsdc
      totalSupplyShares
      assetCount
      depositFeeBps
      redeemFeeBps
      minReserveBps
      requiredReserveUsdc
      availableForPerpUsdc
      collectedFeesUsdc
      cumulativeFeesCollectedUsdc
      openInterest
      collateralLocked
      positionCount
    }
  }
`;

const GRAPH_GET_BASKETS_WEEK_SNAPSHOTS = gql`
  query GetBasketsWeekSnapshots($ids: [String!]!) {
    baskets(where: { id_in: $ids }) {
      id
      vault
      snapshots(where: { period: "7d" }, first: 2, orderBy: bucketStart, orderDirection: desc) {
        id
        period
        bucketStart
        bucketEnd
        createdAt
        updatedAt
        sharePrice
        basketPrice
        usdcBalanceUsdc
        perpAllocatedUsdc
        tvlBookUsdc
        totalSupplyShares
        assetCount
        depositFeeBps
        redeemFeeBps
        minReserveBps
        requiredReserveUsdc
        availableForPerpUsdc
        collectedFeesUsdc
        cumulativeFeesCollectedUsdc
        openInterest
        collateralLocked
        positionCount
      }
    }
  }
`;

const GRAPH_GET_SHARE_PRICE_HISTORY = gql`
  query GetSharePriceHistory($id: ID!, $first: Int!) {
    basketSnapshots(
      where: { basket_: { id: $id }, period: "1d" }
      first: $first
      orderBy: bucketStart
      orderDirection: asc
    ) {
      bucketStart
      updatedAt
      sharePrice
      tvlBookUsdc
    }
  }
`;

const GRAPH_GET_BASKET_ACTIVITIES = gql`
  query GetBasketActivities($id: String!, $first: Int!, $skip: Int!) {
    basketActivities(
      where: { basket_: { id: $id } }
      first: $first
      skip: $skip
      orderBy: timestamp
      orderDirection: desc
    ) {
      id
      activityType
      user {
        id
      }
      assetId
      isLong
      amountUsdc
      shares
      size
      collateral
      pnl
      recipient
      timestamp
      txHash
    }
  }
`;

const GRAPH_GET_USER_PORTFOLIO = gql`
  query GetUserPortfolio($userAddress: Bytes!, $chainId: Int!, $first: Int!) {
    userBasketPositions(
      first: $first
      where: {
        chainId: $chainId
        user_: { address: $userAddress, chainId: $chainId }
        shareBalance_gt: "0"
      }
      orderBy: updatedAt
      orderDirection: desc
    ) {
      id
      shareBalance
      netDepositedUsdc
      netRedeemedUsdc
      cumulativeDepositedUsdc
      cumulativeRedeemedUsdc
      updatedAt
      basket {
        id
        name
        vault
        shareToken
        sharePrice
        basketPrice
      }
    }
  }
`;

const GRAPH_GET_TOKEN_HOLDER_ADDRESSES = gql`
  query GetTokenHolderAddresses($first: Int!, $skip: Int!) {
    userBasketPositions(
      first: $first
      skip: $skip
      where: { shareBalance_gt: "0" }
      orderBy: updatedAt
      orderDirection: desc
    ) {
      id
      user {
        id
      }
    }
  }
`;

const GRAPH_GET_ADMIN_VAULT_STATES = gql`
  query GetAdminVaultStates($first: Int!, $skip: Int!, $chainId: Int!) {
    vaultStateCurrents(
      first: $first
      skip: $skip
      where: { chainId: $chainId }
      orderBy: updatedAt
      orderDirection: desc
    ) {
      id
      registered
      paused
      depositedCapital
      realisedPnl
      openInterest
      positionCount
      collateralLocked
      updatedAt
      basket {
        id
        name
        vault
        tvlBookUsdc
        perpAllocatedUsdc
      }
    }
  }
`;

const GRAPH_GET_ORACLE_PRICE_UPDATES = gql`
  query GetOraclePriceUpdates($assetId: Bytes!, $chainId: Int!, $minTimestamp: BigInt!, $first: Int!) {
    oraclePriceUpdates(
      where: { assetId: $assetId, chainId: $chainId, priceTimestamp_gte: $minTimestamp }
      first: $first
      orderBy: priceTimestamp
      orderDirection: desc
    ) {
      id
      assetId
      price
      priceTimestamp
      blockNumber
      txHash
      logIndex
      createdAt
    }
  }
`;

const GRAPH_GET_CHAIN_POOL_STATES = gql`
  query GetChainPoolStates {
    chainPoolStates(orderBy: twapPoolAmount, orderDirection: desc) {
      id
      chainSelector
      twapPoolAmount
      availableLiquidity
      reservedAmount
      utilizationBps
      snapshotTimestamp
      snapshotCount
      updatedAt
    }
  }
`;

export const GET_BASKETS_OVERVIEW = isEnvioMode ? ENVIO_GET_BASKETS_OVERVIEW : GRAPH_GET_BASKETS_OVERVIEW;
export const GET_BASKET_DETAIL = isEnvioMode ? ENVIO_GET_BASKET_DETAIL : GRAPH_GET_BASKET_DETAIL;
export const GET_BASKET_TREND_SNAPSHOTS = isEnvioMode ? ENVIO_GET_BASKET_TREND_SNAPSHOTS : GRAPH_GET_BASKET_TREND_SNAPSHOTS;
export const GET_BASKETS_WEEK_SNAPSHOTS = isEnvioMode ? ENVIO_GET_BASKETS_WEEK_SNAPSHOTS : GRAPH_GET_BASKETS_WEEK_SNAPSHOTS;
export const GET_SHARE_PRICE_HISTORY = isEnvioMode ? ENVIO_GET_SHARE_PRICE_HISTORY : GRAPH_GET_SHARE_PRICE_HISTORY;
export const GET_BASKET_ACTIVITIES = isEnvioMode ? ENVIO_GET_BASKET_ACTIVITIES : GRAPH_GET_BASKET_ACTIVITIES;
export const GET_USER_PORTFOLIO = isEnvioMode ? ENVIO_GET_USER_PORTFOLIO : GRAPH_GET_USER_PORTFOLIO;
export const GET_TOKEN_HOLDER_ADDRESSES = isEnvioMode ? ENVIO_GET_TOKEN_HOLDER_ADDRESSES : GRAPH_GET_TOKEN_HOLDER_ADDRESSES;
export const GET_ADMIN_VAULT_STATES = isEnvioMode ? ENVIO_GET_ADMIN_VAULT_STATES : GRAPH_GET_ADMIN_VAULT_STATES;
export const GET_ORACLE_PRICE_UPDATES = isEnvioMode ? ENVIO_GET_ORACLE_PRICE_UPDATES : GRAPH_GET_ORACLE_PRICE_UPDATES;
export const GET_CHAIN_POOL_STATES = isEnvioMode ? ENVIO_GET_CHAIN_POOL_STATES : GRAPH_GET_CHAIN_POOL_STATES;
