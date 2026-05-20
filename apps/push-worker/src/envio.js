import { GraphQLClient, gql } from "graphql-request";

/**
 * Envio HyperIndex (Hasura) queries for push-worker signal scans.
 * Aliases preserve the legacy response shape that `dispatch.js` consumes:
 *   - `basketActivities`
 *   - `vaultStateCurrents`
 *   - `oraclePriceUpdates`
 */

const GET_RECENT_ACTIVITIES = gql`
  query GetRecentActivities($minTimestamp: numeric!, $first: Int!) {
    basketActivities: BasketActivity(
      where: { timestamp: { _gt: $minTimestamp } }
      limit: $first
      order_by: { timestamp: asc }
    ) {
      id
      activityType
      timestamp
      txHash
      amountUsdc
      pnl
      user {
        id
      }
      basket {
        id
        name
      }
    }
    vaultStateCurrents: VaultStateCurrent(
      limit: 200
      order_by: { updatedAt: desc }
    ) {
      id
      paused
      depositedCapital
      openInterest
      basket {
        id
        name
        usdcBalanceUsdc
        tvlBookUsdc
        minReserveBps
      }
    }
    oraclePriceUpdates: OraclePriceUpdate(
      limit: 1
      order_by: { priceTimestamp: desc }
    ) {
      priceTimestamp
    }
  }
`;

const GET_DIGEST_ACTIVITIES = gql`
  query GetDigestActivities($minTimestamp: numeric!, $first: Int!) {
    basketActivities: BasketActivity(
      where: { timestamp: { _gt: $minTimestamp } }
      limit: $first
      order_by: { timestamp: asc }
    ) {
      activityType
      timestamp
      user {
        id
      }
    }
  }
`;

export function createEnvioClient(url) {
  return new GraphQLClient(url, {
    headers: {
      "content-type": "application/json",
    },
  });
}

export async function fetchRecentSignals(client, minTimestamp, first = 400) {
  return client.request(GET_RECENT_ACTIVITIES, {
    minTimestamp: String(minTimestamp),
    first,
  });
}

export async function fetchDigestActivities(client, minTimestamp, first = 1000) {
  return client.request(GET_DIGEST_ACTIVITIES, {
    minTimestamp: String(minTimestamp),
    first,
  });
}
