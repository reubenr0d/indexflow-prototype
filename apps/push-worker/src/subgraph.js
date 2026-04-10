import { GraphQLClient, gql } from "graphql-request";

const GET_RECENT_ACTIVITIES = gql`
  query GetRecentActivities($minTimestamp: BigInt!, $first: Int!) {
    basketActivities(
      where: { timestamp_gt: $minTimestamp }
      first: $first
      orderBy: timestamp
      orderDirection: asc
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
    vaultStateCurrents(first: 200, orderBy: updatedAt, orderDirection: desc) {
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
    oraclePriceUpdates(first: 1, orderBy: priceTimestamp, orderDirection: desc) {
      priceTimestamp
    }
  }
`;

const GET_DIGEST_ACTIVITIES = gql`
  query GetDigestActivities($minTimestamp: BigInt!, $first: Int!) {
    basketActivities(
      where: { timestamp_gt: $minTimestamp }
      first: $first
      orderBy: timestamp
      orderDirection: asc
    ) {
      activityType
      timestamp
      user {
        id
      }
    }
  }
`;

export function createSubgraphClient(url) {
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
