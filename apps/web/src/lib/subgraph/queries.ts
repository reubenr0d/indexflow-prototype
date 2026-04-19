import { gql } from "graphql-request";

export const GET_BASKETS_OVERVIEW = gql`
  query GetBasketsOverview($first: Int!, $skip: Int!) {
    baskets(first: $first, skip: $skip, orderBy: updatedAt, orderDirection: desc) {
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
      createdAt
      updatedAt
    }
  }
`;

export const GET_BASKET_DETAIL = gql`
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

export const GET_BASKET_TREND_SNAPSHOTS = gql`
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

export const GET_BASKETS_WEEK_SNAPSHOTS = gql`
  query GetBasketsWeekSnapshots($ids: [String!]!) {
    baskets(where: { id_in: $ids }) {
      id
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

export const GET_SHARE_PRICE_HISTORY = gql`
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

export const GET_BASKET_ACTIVITIES = gql`
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

export const GET_USER_PORTFOLIO = gql`
  query GetUserPortfolio($userId: String!, $first: Int!) {
    userBasketPositions(
      first: $first
      where: { user_: { id: $userId }, shareBalance_gt: "0" }
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

export const GET_TOKEN_HOLDER_ADDRESSES = gql`
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

export const GET_ADMIN_VAULT_STATES = gql`
  query GetAdminVaultStates($first: Int!, $skip: Int!) {
    vaultStateCurrents(first: $first, skip: $skip, orderBy: updatedAt, orderDirection: desc) {
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

export const GET_ORACLE_PRICE_UPDATES = gql`
  query GetOraclePriceUpdates($assetId: Bytes!, $minTimestamp: BigInt!, $first: Int!) {
    oraclePriceUpdates(
      where: { assetId: $assetId, priceTimestamp_gte: $minTimestamp }
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

export const GET_COORDINATION_STATE = gql`
  query GetCoordinationState {
    coordinationState(id: "singleton") {
      id
      latestTwapPoolAmount
      latestAvailableLiquidity
      latestUtilizationBps
      latestSnapshotTimestamp
      snapshotCount
      updatedAt
    }
  }
`;

export const GET_CHAIN_POOL_STATES = gql`
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

export const GET_RECENT_INTENTS = gql`
  query GetRecentIntents($first: Int!, $skip: Int!) {
    intentActions(
      first: $first
      skip: $skip
      orderBy: timestamp
      orderDirection: desc
    ) {
      id
      intentId
      user
      intentType
      status
      amount
      basketVault
      sharesOrUsdc
      timestamp
      blockNumber
      txHash
    }
    intentStats(id: "singleton") {
      totalSubmitted
      totalExecuted
      totalRefunded
      cumulativeVolumeUsdc
    }
  }
`;
