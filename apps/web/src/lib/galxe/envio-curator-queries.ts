import { gql } from "graphql-request";
import type {
  EnvioBasketActivityRow,
  EnvioBasketRow,
  EnvioSnapshotRow,
} from "./types";

export const ENVIO_GET_CURATOR_BASKETS = gql`
  query GetCuratorBaskets($first: Int!, $skip: Int!) {
    baskets: Basket(limit: $first, offset: $skip, order_by: { createdAt: asc }) {
      id
      chainId
      creator
      vault
      name
      createdAt
      assetCount
      minReserveBps
      sharePrice
      assets(where: { active: { _eq: true } }) {
        id
        active
      }
    }
  }
`;

export const ENVIO_GET_BASKET_WEEK_SNAPSHOTS = gql`
  query GetBasketWeekSnapshots($id: ID!) {
    weekSnapshots: BasketSnapshot(
      where: { basket: { id: { _eq: $id } }, period: { _eq: "7d" } }
      limit: 3
      order_by: { bucketStart: desc }
    ) {
      bucketStart
      sharePrice
    }
  }
`;

export const ENVIO_GET_BASKET_ACTIVITIES_SINCE = gql`
  query GetBasketActivitiesSince($basketId: String!, $minTimestamp: numeric!) {
    basketActivities: BasketActivity(
      where: { basket: { id: { _eq: $basketId } }, timestamp: { _gte: $minTimestamp } }
      limit: 200
      order_by: { timestamp: desc }
    ) {
      activityType
      timestamp
      user {
        id
      }
    }
  }
`;

export const ENVIO_GET_WALLET_ACTIVITIES = gql`
  query GetWalletActivities($userId: String!, $first: Int!) {
    basketActivities: BasketActivity(
      where: { user: { id: { _eq: $userId } } }
      limit: $first
      order_by: { timestamp: desc }
    ) {
      activityType
      timestamp
      user {
        id
      }
    }
  }
`;

export interface EnvioClientLike {
  request<T>(query: string, variables?: Record<string, unknown>): Promise<T>;
}

export async function fetchAllCuratorBaskets(client: EnvioClientLike): Promise<EnvioBasketRow[]> {
  const pageSize = 200;
  const rows: EnvioBasketRow[] = [];
  for (let skip = 0; ; skip += pageSize) {
    const page = await client.request<{ baskets: EnvioBasketRow[] }>(ENVIO_GET_CURATOR_BASKETS, {
      first: pageSize,
      skip,
    });
    rows.push(...page.baskets);
    if (page.baskets.length < pageSize) break;
  }
  return rows;
}

export async function fetchBasketWeekSnapshots(
  client: EnvioClientLike,
  basketId: string,
): Promise<EnvioSnapshotRow[]> {
  const data = await client.request<{ weekSnapshots: EnvioSnapshotRow[] }>(ENVIO_GET_BASKET_WEEK_SNAPSHOTS, {
    id: basketId,
  });
  return data.weekSnapshots;
}

export async function fetchBasketActivitiesSince(
  client: EnvioClientLike,
  basketId: string,
  minTimestamp: number,
): Promise<EnvioBasketActivityRow[]> {
  const data = await client.request<{ basketActivities: EnvioBasketActivityRow[] }>(
    ENVIO_GET_BASKET_ACTIVITIES_SINCE,
    {
      basketId,
      minTimestamp: String(minTimestamp),
    },
  );
  return data.basketActivities;
}

export async function fetchWalletActivities(
  client: EnvioClientLike,
  chainId: number,
  address: string,
  first = 5,
): Promise<EnvioBasketActivityRow[]> {
  const userId = `${chainId}-${address.toLowerCase()}`;
  const data = await client.request<{ basketActivities: EnvioBasketActivityRow[] }>(ENVIO_GET_WALLET_ACTIVITIES, {
    userId,
    first,
  });
  return data.basketActivities;
}
