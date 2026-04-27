import { gql } from "graphql-request";

/**
 * Envio/Hasura-compatible GraphQL queries.
 * These use Hasura's query syntax which differs from The Graph:
 * - PascalCase entity names (Basket vs baskets)
 * - Object-based filters (chainId: { _eq: $chainId } vs chainId: $chainId)
 * - order_by syntax vs orderBy/orderDirection
 * - limit/offset vs first/skip
 */

export const ENVIO_GET_BASKETS_OVERVIEW = gql`
  query GetBasketsOverview($first: Int!, $skip: Int!, $chainId: Int!) {
    baskets: Basket(
      limit: $first
      offset: $skip
      where: { chainId: { _eq: $chainId } }
      order_by: { updatedAt: desc }
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

export const ENVIO_GET_BASKET_DETAIL = gql`
  query GetBasketDetail($id: ID!) {
    basket: Basket_by_pk(id: $id) {
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
      exposures(order_by: { netSize: desc }) {
        id
        assetId
        longSize
        shortSize
        netSize
        updatedAt
      }
      assets(where: { active: { _eq: true } }, order_by: { updatedAt: desc }) {
        id
        assetId
        active
        updatedAt
      }
      activities(limit: 100, order_by: { timestamp: desc }) {
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
    vaultStateCurrent: VaultStateCurrent_by_pk(id: $id) {
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

export const ENVIO_GET_BASKET_TREND_SNAPSHOTS = gql`
  query GetBasketTrendSnapshots($id: ID!) {
    daySnapshots: BasketSnapshot(
      where: { basket: { id: { _eq: $id } }, period: { _eq: "1d" } }
      limit: 2
      order_by: { bucketStart: desc }
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
    weekSnapshots: BasketSnapshot(
      where: { basket: { id: { _eq: $id } }, period: { _eq: "7d" } }
      limit: 2
      order_by: { bucketStart: desc }
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

export const ENVIO_GET_BASKETS_WEEK_SNAPSHOTS = gql`
  query GetBasketsWeekSnapshots($ids: [String!]!) {
    baskets: Basket(where: { id: { _in: $ids } }) {
      id
      vault
      snapshots(where: { period: { _eq: "7d" } }, limit: 2, order_by: { bucketStart: desc }) {
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

export const ENVIO_GET_SHARE_PRICE_HISTORY = gql`
  query GetSharePriceHistory($id: ID!, $first: Int!) {
    basketSnapshots: BasketSnapshot(
      where: { basket: { id: { _eq: $id } }, period: { _eq: "1d" } }
      limit: $first
      order_by: { bucketStart: asc }
    ) {
      bucketStart
      updatedAt
      sharePrice
      tvlBookUsdc
    }
  }
`;

export const ENVIO_GET_BASKET_ACTIVITIES = gql`
  query GetBasketActivities($id: String!, $first: Int!, $skip: Int!) {
    basketActivities: BasketActivity(
      where: { basket: { id: { _eq: $id } } }
      limit: $first
      offset: $skip
      order_by: { timestamp: desc }
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

export const ENVIO_GET_USER_PORTFOLIO = gql`
  query GetUserPortfolio($userAddress: String!, $chainId: Int!, $first: Int!) {
    userBasketPositions: UserBasketPosition(
      limit: $first
      where: {
        chainId: { _eq: $chainId }
        user: { address: { _eq: $userAddress }, chainId: { _eq: $chainId } }
        shareBalance: { _gt: "0" }
      }
      order_by: { updatedAt: desc }
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

export const ENVIO_GET_TOKEN_HOLDER_ADDRESSES = gql`
  query GetTokenHolderAddresses($first: Int!, $skip: Int!) {
    userBasketPositions: UserBasketPosition(
      limit: $first
      offset: $skip
      where: { shareBalance: { _gt: "0" } }
      order_by: { updatedAt: desc }
    ) {
      id
      user {
        id
      }
    }
  }
`;

export const ENVIO_GET_ADMIN_VAULT_STATES = gql`
  query GetAdminVaultStates($first: Int!, $skip: Int!, $chainId: Int!) {
    vaultStateCurrents: VaultStateCurrent(
      limit: $first
      offset: $skip
      where: { chainId: { _eq: $chainId } }
      order_by: { updatedAt: desc }
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

export const ENVIO_GET_ORACLE_PRICE_UPDATES = gql`
  query GetOraclePriceUpdates($assetId: String!, $chainId: Int!, $minTimestamp: String!, $first: Int!) {
    oraclePriceUpdates: OraclePriceUpdate(
      where: { assetId: { _eq: $assetId }, chainId: { _eq: $chainId }, priceTimestamp: { _gte: $minTimestamp } }
      limit: $first
      order_by: { priceTimestamp: desc }
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

export const ENVIO_GET_CHAIN_POOL_STATES = gql`
  query GetChainPoolStates {
    chainPoolStates: ChainPoolState(order_by: { twapPoolAmount: desc }) {
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
