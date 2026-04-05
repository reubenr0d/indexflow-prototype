const BPS_DENOM = 10_000n;

type WeightedTarget = {
  amount: bigint;
  remainder: bigint;
};

function distributeByWeights(total: bigint, weights: bigint[]): bigint[] {
  const count = weights.length;
  if (count === 0 || total <= 0n) return Array.from({ length: count }, () => 0n);

  const totalWeight = weights.reduce((sum, w) => sum + w, 0n);
  if (totalWeight <= 0n) {
    const base = total / BigInt(count);
    const rem = total % BigInt(count);
    return Array.from({ length: count }, (_, i) => base + (BigInt(i) < rem ? 1n : 0n));
  }

  const provisional: WeightedTarget[] = weights.map((w) => {
    const numerator = total * w;
    return {
      amount: numerator / totalWeight,
      remainder: numerator % totalWeight,
    };
  });

  let assigned = provisional.reduce((sum, p) => sum + p.amount, 0n);
  let remainderUnits = total - assigned;

  const order = provisional
    .map((p, i) => ({ i, remainder: p.remainder }))
    .sort((a, b) => {
      if (a.remainder === b.remainder) return a.i - b.i;
      return a.remainder > b.remainder ? -1 : 1;
    });

  let cursor = 0;
  while (remainderUnits > 0n && order.length > 0) {
    provisional[order[cursor].i].amount += 1n;
    remainderUnits -= 1n;
    cursor = (cursor + 1) % order.length;
  }

  assigned = provisional.reduce((sum, p) => sum + p.amount, 0n);
  if (assigned !== total) {
    const delta = total - assigned;
    provisional[0].amount += delta;
  }

  return provisional.map((p) => p.amount);
}

function normalizeBps(values: bigint[]): bigint[] {
  if (values.length === 0) return [];

  const total = values.reduce((sum, v) => sum + v, 0n);
  if (total <= 0n) {
    return distributeByWeights(BPS_DENOM, Array.from({ length: values.length }, () => 1n));
  }

  return distributeByWeights(BPS_DENOM, values);
}

export function computeCurrentSplits(perpAllocated: bigint[]): bigint[] {
  return normalizeBps(perpAllocated);
}

export function computeMaxDistributedTopUps(
  availableForPerp: bigint[],
  splitBps: bigint[]
): bigint[] {
  const count = availableForPerp.length;
  if (count === 0) return [];

  const caps = [...availableForPerp];
  const normalizedSplits = normalizeBps(
    splitBps.length === count ? splitBps : Array.from({ length: count }, () => 1n)
  );
  const maxPool = caps.reduce((sum, a) => sum + a, 0n);

  const allocation = distributeByWeights(maxPool, normalizedSplits);

  for (let guard = 0; guard < count * 4; guard += 1) {
    let overflow = 0n;
    const eligible: number[] = [];

    for (let i = 0; i < count; i += 1) {
      if (allocation[i] > caps[i]) {
        overflow += allocation[i] - caps[i];
        allocation[i] = caps[i];
      }
      if (allocation[i] < caps[i]) eligible.push(i);
    }

    if (overflow === 0n || eligible.length === 0) break;

    const eligibleWeights = eligible.map((i) => normalizedSplits[i]);
    const redistributed = distributeByWeights(overflow, eligibleWeights);
    eligible.forEach((idx, j) => {
      allocation[idx] += redistributed[j];
    });
  }

  for (let i = 0; i < count; i += 1) {
    if (allocation[i] > caps[i]) allocation[i] = caps[i];
    if (allocation[i] < 0n) allocation[i] = 0n;
  }

  return allocation;
}

export function computeTargetSplitTopUps(
  perpAllocated: bigint[],
  availableForPerp: bigint[],
  targetSplitBps: bigint[]
): { topUps: bigint[]; withdraws: bigint[] } {
  const count = perpAllocated.length;
  if (count === 0) return { topUps: [], withdraws: [] };

  const totalPerp = perpAllocated.reduce((sum, v) => sum + v, 0n);
  const normalizedTarget = normalizeBps(
    targetSplitBps.length === count ? targetSplitBps : Array.from({ length: count }, () => 1n)
  );
  const targetTotals = distributeByWeights(totalPerp, normalizedTarget);

  const topUps = Array.from({ length: count }, () => 0n);
  const withdraws = Array.from({ length: count }, () => 0n);

  for (let i = 0; i < count; i += 1) {
    const delta = targetTotals[i] - perpAllocated[i];
    if (delta > 0n) {
      topUps[i] = delta > availableForPerp[i] ? availableForPerp[i] : delta;
    } else if (delta < 0n) {
      withdraws[i] = -delta;
    }
  }

  return { topUps, withdraws };
}
