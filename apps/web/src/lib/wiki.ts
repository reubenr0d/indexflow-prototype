export const DOCS_LAST_UPDATED = "2026-04-07";

export type DocsRoleTag = "Investor" | "Operator" | "Gov" | "Keeper";

export type DocsSlug =
  | "overview"
  | "investor"
  | "operator"
  | "perp-risk-math"
  | "operator-interactions"
  | "oracle-price-sync"
  | "pool-management"
  | "contracts-reference"
  | "troubleshooting"
  | "security-risk";

export interface DocsSection {
  id: string;
  title: string;
  items: string[];
}

export interface DocsFormula {
  name: string;
  expression: string;
  notes: string;
}

export interface DocsUnitTerm {
  term: string;
  value: string;
  notes: string;
}

export interface DocsInteraction {
  contract: string;
  fn: string;
  caller: string;
  inputs: string[];
  preconditions: string[];
  stateDeltas: string[];
  failureRisks: string[];
  postTxChecks: string[];
}

export interface DocsPage {
  slug: DocsSlug;
  title: string;
  summary: string;
  audience: string;
  roleTags: DocsRoleTag[];
  order: number;
  lastUpdated: string;
  networkContext: string;
  overview: string[];
  guides: string[];
  reference: string[];
  permissions: string[];
  flow: DocsSection[];
  formulas?: DocsFormula[];
  unitsGlossary?: DocsUnitTerm[];
  interactionMatrix?: DocsInteraction[];
  preflightChecklist?: string[];
  postflightChecklist?: string[];
  failureModes: string[];
  callouts: Array<{
    tone: "info" | "warning";
    title: string;
    body: string;
  }>;
  relatedSlugs: DocsSlug[];
  sourceDocs: string[];
}

export const DOCS_SLUGS: DocsSlug[] = [
  "overview",
  "investor",
  "operator",
  "perp-risk-math",
  "operator-interactions",
  "oracle-price-sync",
  "pool-management",
  "contracts-reference",
  "troubleshooting",
  "security-risk",
];

export const DOCS_PAGES: Record<DocsSlug, DocsPage> = {
  overview: {
    slug: "overview",
    title: "Protocol Overview",
    summary:
      "A simple explanation of the moving parts: baskets, the shared perp layer, and how GMX fits in.",
    audience: "Anyone new to the protocol who wants the big picture before using the app or integrating with it.",
    roleTags: ["Operator", "Keeper"],
    order: 1,
    lastUpdated: DOCS_LAST_UPDATED,
    networkContext: "The same flow applies across environments, but contract addresses and permissions change between local and testnet deployments.",
    overview: [
      "Users deposit USDC into a basket vault and receive basket shares in return.",
      "Some of that USDC can be moved into a shared perp system that manages trading positions.",
      "Different parts of the system read prices from different contracts, so operators have to keep those price paths current.",
    ],
    guides: [
      "Read this page first to understand the overall flow of money and permissions.",
      "Move to the operator page if you need to create baskets, route capital, or manage positions.",
      "Read the oracle page before live trading so you understand how prices reach the GMX side of the system.",
    ],
    reference: [
      "Main contracts: BasketVault, VaultAccounting, OracleAdapter, PriceSync, SimplePriceFeed, and the GMX Vault.",
      "Main app areas: /baskets, /portfolio, /admin, and /admin/pool.",
      "Each page links back to the deeper markdown docs if you need more detail.",
    ],
    permissions: [
      "Investors can deposit and redeem, but they do not control strategy operations.",
      "Basket owners control basket settings and decide how much capital moves into the perp layer.",
      "The VaultAccounting owner controls registration, asset mappings, and risk limits.",
      "Gov and keeper roles handle price feeds, funding updates, and other protocol-level tasks.",
    ],
    flow: [
      {
        id: "capital-path",
        title: "Capital Path",
        items: [
          "Investor deposits USDC to BasketVault and receives shares.",
          "Basket owner can allocate USDC to VaultAccounting as perp capital.",
          "Authorized position caller opens and closes GMX positions via VaultAccounting.",
          "Owner withdraws from perp path to replenish basket redemption liquidity.",
        ],
      },
      {
        id: "price-path",
        title: "Price Path",
        items: [
          "OracleAdapter reads Chainlink feeds on demand for configured assets.",
          "For custom relayer assets, keepers must submit prices into OracleAdapter.",
          "PriceSync copies adapter prices into SimplePriceFeed for GMX consumption.",
          "GMX Vault functions then use SimplePriceFeed min and max prices.",
        ],
      },
    ],
    failureModes: [
      "Redeems can fail when idle USDC in BasketVault is insufficient even if mark-to-market value is higher.",
      "GMX execution can price against stale feed values if PriceSync has not been called recently.",
      "VaultAccounting actions revert if vault is unregistered, paused, or missing asset-token mapping.",
    ],
    callouts: [
      {
        tone: "info",
        title: "Design intent",
        body: "The protocol separates investor-facing basket logic from GMX execution logic. That makes operations more flexible, but it also means there are more moving parts to maintain.",
      },
    ],
    relatedSlugs: ["operator", "oracle-price-sync", "pool-management"],
    sourceDocs: [
      "README.md",
      "docs/INVESTOR_FLOW.md",
      "docs/ASSET_MANAGER_FLOW.md",
      "docs/PRICE_FEED_FLOW.md",
    ],
  },
  investor: {
    slug: "investor",
    title: "Investor Guide",
    summary:
      "How deposits and redemptions work, what your shares represent, and why withdrawals can be limited by available cash.",
    audience: "New users, frontend integrators, and anyone explaining the product from an investor point of view.",
    roleTags: ["Investor", "Operator"],
    order: 2,
    lastUpdated: DOCS_LAST_UPDATED,
    networkContext: "The user experience is the same across environments, but token addresses and available liquidity differ by chain.",
    overview: [
      "Investors deposit USDC and receive basket shares.",
      "Those shares track the value of the basket according to the protocol's pricing rules.",
      "If more capital is moved into the perp side, less idle cash may be available for immediate withdrawals.",
    ],
    guides: [
      "Approve USDC, then deposit into the basket vault to mint shares.",
      "Before redeeming, check how much USDC is actually sitting in the basket vault.",
      "Use basket history and portfolio views to explain what changed over time.",
    ],
    reference: [
      "Important functions: deposit, redeem, getBasketPrice, getSharePrice, and topUpReserve.",
      "Important concepts: idle USDC, capital allocated to perps, and fees held back by the vault.",
      "Helpful reads: PerpReader and indexed history views for activity and exposure.",
    ],
    permissions: [
      "Investors can deposit and redeem.",
      "Only the basket owner can move capital into or out of the perp layer.",
      "Anyone can add reserve USDC without minting new shares by calling topUpReserve.",
    ],
    flow: [
      {
        id: "deposit-redeem",
        title: "Deposit And Redeem",
        items: [
          "Approve USDC to BasketVault.",
          "Call deposit; shares mint after fee logic.",
          "Call redeem to burn shares for USDC output based on vault pricing logic.",
          "The basket UI now shows a quote preview, explicit action icons, and an inline transaction rail so the user sees approval, submit, and confirmation states in one place.",
          "In the basket UI, switching between Deposit and Redeem clears the typed amount to avoid accidental cross-mode submits.",
          "If liquidity is tight, owner must withdraw perp capital or reserve must be topped up.",
        ],
      },
      {
        id: "liquidity-model",
        title: "Liquidity Model",
        items: [
          "Redeems draw from idle USDC in BasketVault, net of collectedFees.",
          "Perp-allocated capital is not directly redeemable by investors.",
          "Realized and unrealized PnL can move NAV-style metrics separately from instant redeem headroom.",
        ],
      },
    ],
    failureModes: [
      "Redeem reverts when requested USDC exceeds idle vault balance after fees.",
      "Integrations that assume full NAV is always withdrawable will misquote exits.",
      "Ignoring oracle freshness and feed differences can cause confusing user-facing valuation gaps.",
    ],
    callouts: [
      {
        tone: "warning",
        title: "Liquidity warning",
        body: "The basket may look profitable on paper and still have limited cash available for immediate redemptions.",
      },
    ],
    relatedSlugs: ["overview", "operator", "troubleshooting"],
    sourceDocs: ["docs/INVESTOR_FLOW.md", "README.md"],
  },
  operator: {
    slug: "operator",
    title: "Operator Runbook",
    summary:
      "A day-to-day guide for the people running baskets, moving capital, and overseeing trading activity.",
    audience: "Basket owners, operators, and automation builders who need to run the system safely.",
    roleTags: ["Operator", "Gov"],
    order: 3,
    lastUpdated: DOCS_LAST_UPDATED,
    networkContext: "Write actions depend on the active environment. Confirm the connected chain and deployment config before sending transactions.",
    overview: [
      "Operators decide how a basket is set up and how much of its cash is kept liquid.",
      "Before trading starts, the basket has to be connected to the shared trading system properly.",
      "The biggest operating choice is how much cash stays in the basket versus how much is sent out to trade.",
    ],
    guides: [
      "Think of setup as a checklist: create the basket, connect it to the trading side, confirm the markets it can use, then set safety limits.",
      "Day to day, operators mostly move capital in or out, manage exposure, and make sure enough liquidity remains for redemptions.",
      "Risk limits and pause controls should be treated as tools you may genuinely need, not just settings to fill in once.",
      "Use Perp Risk Math and Operator Interactions pages as transaction-level references before sending writes.",
    ],
    reference: [
      "Basket-level controls cover things like asset setup, fees, reserve policy, and how much capital can be sent to trading.",
      "Trading-system controls cover which baskets are allowed in, which markets they can use, and how much risk they can take.",
      "Opening and closing positions is restricted to approved operator paths; size is entered as USD notional while collateral is entered as USDC.",
      "Composition views use indexed exposure first and fallback to onchain position tracking when indexing lags.",
      "Interaction-level inputs, units, preconditions, and post-tx checks are documented in the interaction matrix page.",
    ],
    permissions: [
      "The basket owner controls basket-specific settings.",
      "The trading-system owner controls onboarding and risk settings for connected baskets.",
      "Only approved callers can manage positions.",
    ],
    flow: [
      {
        id: "setup",
        title: "Getting A Basket Ready",
        items: [
          "Create the basket and make sure it points at the shared trading system.",
          "Confirm the basket is allowed to use the trading layer before any positions are opened.",
          "Match each supported basket asset to the market it should trade against.",
          "Set basic safety limits before letting operators use the basket live.",
        ],
      },
      {
        id: "operations",
        title: "Running It Day To Day",
        items: [
          "Move capital into trading only when the basket still has enough cash for expected withdrawals.",
          "Open and close positions as part of normal strategy management.",
          "Pull money and realized profits back when users need liquidity or risk needs to come down.",
          "Collect fees and keep an eye on reserve levels so the basket stays usable.",
        ],
      },
    ],
    failureModes: [
      "Trading actions fail when the basket has not been set up fully or a risk limit has been hit.",
      "Pulling money back can fail if too much capital is still tied up on the trading side.",
      "Sending too much money into trading can leave the basket short on cash for user withdrawals.",
    ],
    callouts: [
      {
        tone: "warning",
        title: "Operational risk",
        body: "The biggest operator mistake is sending too much capital into perps and leaving too little USDC available for redemptions.",
      },
    ],
    relatedSlugs: ["overview", "investor", "perp-risk-math", "operator-interactions", "pool-management", "security-risk"],
    sourceDocs: ["docs/ASSET_MANAGER_FLOW.md", "docs/SHARE_PRICE_AND_OPERATIONS.md", "README.md"],
  },
  "perp-risk-math": {
    slug: "perp-risk-math",
    title: "Perp Risk Math",
    summary:
      "Operator-facing leverage math, unit conventions, and liquidation caveats for long and short position management.",
    audience: "Operators and risk reviewers who need quick but precise math before opening, resizing, or closing positions.",
    roleTags: ["Operator", "Gov"],
    order: 4,
    lastUpdated: DOCS_LAST_UPDATED,
    networkContext:
      "Math examples are intentionally approximate. Live outcomes vary with fees, funding, execution path, and mark-price conditions.",
    overview: [
      "Leverage in this stack is set by how large `size` is relative to posted `collateral`.",
      "At the same leverage, long and short have symmetric risk: direction flips, not the magnitude logic.",
      "Liquidation thresholds should be treated as ranges, not exact percentages.",
    ],
    guides: [
      "Compute leverage and downside first, then decide size and collateral.",
      "Treat fee and funding drag as part of risk budget, especially on held positions.",
      "Re-check available capital and caps before any increase action.",
    ],
    reference: [
      "Effective leverage approximation: `size / collateral`.",
      "PnL approximation: `size * priceMovePercent` (signed by direction).",
      "Collateral return approximation: `leverage * priceMovePercent`.",
    ],
    permissions: [
      "Opening and closing positions still requires authorized caller paths.",
      "Risk cap and pause controls remain owner-governed controls.",
      "Math guidance does not override onchain checks and revert conditions.",
    ],
    flow: [
      {
        id: "risk-sizing",
        title: "Risk Sizing Before Opening",
        items: [
          "Pick target leverage from strategy limits and current market volatility.",
          "Choose `size` and `collateral` pair that matches that leverage target.",
          "Estimate downside impact from expected adverse move before submitting the transaction.",
          "Validate cap headroom and available capital in admin state cards.",
        ],
      },
      {
        id: "live-monitoring",
        title: "Monitoring After Opening",
        items: [
          "Track open interest, collateral locked, and pool utilization context.",
          "Watch liquidation-risk conditions during fast moves or stale-sync windows.",
          "Reduce size or pull exposure down when margin cushion shrinks.",
        ],
      },
    ],
    formulas: [
      {
        name: "Effective leverage (approx)",
        expression: "leverage ≈ size / collateral",
        notes: "Uses position notional versus posted collateral for one leg.",
      },
      {
        name: "PnL by move (approx)",
        expression: "pnl ≈ size * priceMovePercent",
        notes: "Sign depends on side: long profits on up moves, short profits on down moves.",
      },
      {
        name: "Collateral return (approx)",
        expression: "returnOnCollateral ≈ leverage * priceMovePercent",
        notes: "Excludes fees, funding, and execution effects.",
      },
    ],
    unitsGlossary: [
      {
        term: "USDC atoms",
        value: "1 USDC = 1e6 base units",
        notes: "Most basket-side amounts in UI are entered as USDC and converted to 6-decimal atoms.",
      },
      {
        term: "GMX USD precision",
        value: "USD values often use PRICE_PRECISION (1e30)",
        notes:
          "Comparisons should normalize units before applying formulas. UI notional metrics (open interest, position size, composition net/long/short) are normalized to full-dollar display before rendering.",
      },
      {
        term: "size",
        value: "Position notional exposure",
        notes: "Represents exposure, not cash paid.",
      },
      {
        term: "collateral",
        value: "USDC margin posted for that leg",
        notes: "Margin buffer that absorbs losses before liquidation conditions trigger.",
      },
    ],
    preflightChecklist: [
      "Confirm vault registration and mapped asset token for target market.",
      "Confirm `availableCapital` comfortably exceeds intended collateral plus buffer.",
      "Confirm remaining headroom for `maxOpenInterest` and `maxPositionSize` caps.",
      "Compute leverage and adverse-move loss estimate before opening.",
    ],
    postflightChecklist: [
      "Verify position tracking exists for `(vault, asset, side)` and size/collateral look correct.",
      "Verify expected increases in open interest and collateral locked.",
      "Record tx hash with intended leverage and rationale for auditability.",
      "Set monitoring thresholds for risk reduction triggers.",
    ],
    failureModes: [
      "Simple leverage thresholds can be misleading when fees/funding are non-trivial.",
      "Unit mismatch between USDC atoms and GMX USD precision causes incorrect risk estimates.",
      "Assuming exact liquidation percentages can delay risk reduction and increase drawdown.",
    ],
    callouts: [
      {
        tone: "warning",
        title: "5x rule of thumb",
        body: "At 5x, a ~10% adverse move is roughly -50% on collateral and ~20% adverse is a rough wipeout zone, but liquidation can occur earlier due to fee and margin conditions.",
      },
    ],
    relatedSlugs: ["operator", "operator-interactions", "security-risk", "troubleshooting"],
    sourceDocs: [
      "docs/SHARE_PRICE_AND_OPERATIONS.md",
      "docs/ASSET_MANAGER_FLOW.md",
      "docs/PERP_RISK_MATH.md",
    ],
  },
  "operator-interactions": {
    slug: "operator-interactions",
    title: "Operator Interactions",
    summary:
      "Contract-by-contract interaction matrix with values, units, preconditions, state deltas, and verification checks.",
    audience: "Operators, automation engineers, and reviewers executing basket and perp write flows.",
    roleTags: ["Operator", "Gov"],
    order: 5,
    lastUpdated: DOCS_LAST_UPDATED,
    networkContext:
      "Values shown are workflow defaults and examples. Always validate environment-specific addresses, balances, and caps before writes.",
    overview: [
      "This page maps each common operator transaction to exact inputs, checks, and expected state changes.",
      "Use it as a runbook before high-impact writes and during incident triage.",
      "The matrix focuses on operator-run flows, not every read-only or governance edge function.",
    ],
    guides: [
      "Start with capital movement interactions, then position interactions.",
      "Use preflight checks to avoid avoidable revert costs.",
      "Complete post-tx checks to confirm accounting state is consistent.",
    ],
    reference: [
      "BasketVault controls basket liquidity and allocation boundaries.",
      "VaultAccounting controls capital accounting, position lifecycle, and risk caps.",
      "GMX effects are indirect via VaultAccounting forwarding calls.",
    ],
    permissions: [
      "Basket owner handles basket-level capital/risk controls.",
      "VaultAccounting owner handles registration, mappings, caps, and pause state.",
      "Position-changing calls require approved caller path (`vault` or accounting owner path).",
    ],
    flow: [
      {
        id: "capital-interactions",
        title: "Capital Interactions",
        items: [
          "Allocate to perp only when reserve policy and redemption liquidity remain healthy.",
          "Withdraw from perp to restore basket liquidity or de-risk strategy.",
          "Confirm principal and realised PnL buckets after larger withdrawals.",
        ],
      },
      {
        id: "position-interactions",
        title: "Position Interactions",
        items: [
          "Open with explicit size/collateral plan and cap headroom validation.",
          "Close with intended size and collateral deltas and verify resulting tracking state.",
          "Adjust risk caps or pause state if operating conditions deteriorate.",
        ],
      },
    ],
    interactionMatrix: [
      {
        contract: "BasketVault",
        fn: "allocateToPerp(amount)",
        caller: "Basket owner",
        inputs: ["amount (USDC atoms, 1e6)"],
        preconditions: [
          "VaultAccounting address configured",
          "Reserve-aware `getAvailableForPerpUsdc()` headroom >= amount",
          "Optional `maxPerpAllocation` cap not exceeded",
        ],
        stateDeltas: [
          "Basket `perpAllocated` increases",
          "VaultAccounting `depositedCapital` increases after `depositCapital`",
        ],
        failureRisks: ["Reserve or cap checks fail", "Allowance/transfer path issues", "Perp side paused"],
        postTxChecks: ["`perpAllocated` changed as expected", "VaultAccounting capital reflects deposit", "Idle reserve remains healthy"],
      },
      {
        contract: "BasketVault",
        fn: "withdrawFromPerp(amount)",
        caller: "Basket owner",
        inputs: ["amount (USDC atoms, 1e6)"],
        preconditions: ["VaultAccounting configured", "Perp-side available capital >= amount"],
        stateDeltas: [
          "USDC returns to basket vault",
          "`perpAllocated` decreases, clamped at zero when withdrawal exceeds remaining principal",
        ],
        failureRisks: ["Insufficient available capital due to locked collateral", "Paused state blocks operation"],
        postTxChecks: ["Basket idle USDC increased", "Perp allocation and available capital updated", "Redeem headroom improved"],
      },
      {
        contract: "VaultAccounting",
        fn: "openPosition(vault, asset, isLong, size, collateral)",
        caller: "Authorized position caller",
        inputs: [
          "vault (address)",
          "asset (bytes32 id)",
          "isLong (bool)",
          "size (notional exposure)",
          "collateral (USDC atoms, 1e6)",
        ],
        preconditions: [
          "Vault registered and not paused",
          "Asset mapped to index token",
          "Collateral <= available capital",
          "`maxOpenInterest` and `maxPositionSize` headroom available",
        ],
        stateDeltas: [
          "GMX `increasePosition` called by VA account",
          "Vault `openInterest` increases",
          "Vault `collateralLocked` increases",
          "Position tracking key updated/created",
        ],
        failureRisks: [
          "Unmapped asset, unauthorized caller, or paused state",
          "Collateral availability check fails",
          "Risk cap exceeded",
        ],
        postTxChecks: [
          "Position tracking exists and reflects intended side",
          "`openInterest` and `collateralLocked` deltas match intent",
          "Leverage outcome (`size/collateral`) matches risk budget",
        ],
      },
      {
        contract: "VaultAccounting",
        fn: "closePosition(vault, asset, isLong, sizeDelta, collateralDelta)",
        caller: "Authorized position caller",
        inputs: [
          "sizeDelta (exposure reduction)",
          "collateralDelta (GMX collateral withdrawal parameter)",
        ],
        preconditions: ["Tracked position exists for `(vault, asset, side)`", "Vault registered and not paused"],
        stateDeltas: [
          "GMX `decreasePosition` called by VA account",
          "`openInterest` decreases by sizeDelta",
          "Position tracking reduced or removed",
          "`realisedPnL` updated from returned USDC minus collateral-at-risk estimate",
        ],
        failureRisks: ["Position not found", "Invalid delta values", "Execution conditions degrade return outcome"],
        postTxChecks: [
          "Expected realised PnL sign and magnitude sanity-checked",
          "Remaining size/collateral tracking correct or position removed",
          "Available capital and redemption-liquidity plans updated",
        ],
      },
      {
        contract: "VaultAccounting",
        fn: "setMaxOpenInterest / setMaxPositionSize / setPaused",
        caller: "VaultAccounting owner",
        inputs: [
          "cap values (notional units for open interest and size limits)",
          "paused flag (bool)",
        ],
        preconditions: ["Owner authority on VaultAccounting"],
        stateDeltas: ["Risk envelope and/or global write availability changes"],
        failureRisks: ["Unauthorized caller", "Operational confusion from uncommunicated cap changes"],
        postTxChecks: ["New limits visible in admin reads", "Operator runbooks updated for new policy"],
      },
    ],
    preflightChecklist: [
      "Verify chain, deployment config, and role authority for target function.",
      "Verify units and decimals before entering values.",
      "Verify expected state-delta outcome before signing.",
    ],
    postflightChecklist: [
      "Verify emitted events and state fields aligned with intended action.",
      "Verify no downstream liquidity or cap boundary was unintentionally breached.",
      "Record tx hash, changed values, and rationale in operator log.",
    ],
    failureModes: [
      "Wrong caller role triggers authorization reverts.",
      "Incorrect units produce oversized/undersized actions.",
      "Missing preconditions (mapping, registration, pause, caps) cause avoidable failures.",
    ],
    callouts: [
      {
        tone: "info",
        title: "Use as transaction checklist",
        body: "Treat the interaction matrix as a pre-sign checklist and a post-confirm verification script for every high-impact write.",
      },
    ],
    relatedSlugs: ["operator", "perp-risk-math", "troubleshooting", "contracts-reference"],
    sourceDocs: ["docs/ASSET_MANAGER_FLOW.md", "docs/OPERATOR_INTERACTIONS.md", "README.md"],
  },
  "oracle-price-sync": {
    slug: "oracle-price-sync",
    title: "Oracle And Price Sync",
    summary:
      "How prices move through the system, and why the GMX side needs its own sync step.",
    audience: "Keepers, operators, and newcomers trying to understand how price data reaches trading logic.",
    roleTags: ["Keeper", "Operator", "Gov"],
    order: 6,
    lastUpdated: DOCS_LAST_UPDATED,
    networkContext: "Keeper and gov addresses differ by deployment, so price automation must be checked separately in each environment.",
    overview: [
      "OracleAdapter is the main price source for most of the app.",
      "PriceSync copies those prices into SimplePriceFeed.",
      "GMX only reads SimplePriceFeed, so prices on the trading side do not update unless sync runs.",
    ],
    guides: [
      "Set up supported assets, keeper roles, and token mappings first, then test the full price-update loop.",
      "For Chainlink-backed assets, the main job is making sure sync runs often enough.",
      "For relayer-backed assets, the process is two-step: write the fresh price, then push it into the GMX feed.",
    ],
    reference: [
      "OracleAdapter owner functions control feed setup, asset status, and keeper access.",
      "PriceSync owner functions control mappings and the contracts used for syncing.",
      "SimplePriceFeed gov functions control keepers, spreads, adjustments, and direct price writes.",
    ],
    permissions: [
      "Custom relayer prices can only be written by approved OracleAdapter keepers.",
      "PriceSync must be approved as a keeper on SimplePriceFeed.",
      "Gov controls direct feed overrides and high-impact feed configuration changes.",
    ],
    flow: [
      {
        id: "bootstrap",
        title: "Initial Setup",
        items: [
          "Set up the list of supported assets and who is allowed to update them.",
          "Allow the sync contract to write prices into the GMX-facing feed.",
          "Tell the sync contract which basket asset maps to which GMX token.",
          "Check that GMX is reading from the expected feed contract.",
        ],
      },
      {
        id: "ongoing-sync",
        title: "Keeping Prices Fresh",
        items: [
          "For Chainlink assets, keep the sync job running so GMX keeps seeing updated prices.",
          "For relayer assets, publish the new price first and then run the sync step.",
          "Monitor freshness and failed transactions so stale prices do not go unnoticed.",
        ],
      },
    ],
    failureModes: [
      "If sync jobs stop, the app and the trading engine can start seeing different prices.",
      "Relayer-fed assets go stale when nobody publishes fresh values.",
      "Wrong mappings can push the wrong price into the wrong GMX market.",
    ],
    callouts: [
      {
        tone: "warning",
        title: "Critical sequencing",
        body: "For relayer assets, the new price has to be submitted before sync runs. If not, GMX keeps using the old price.",
      },
    ],
    relatedSlugs: ["overview", "operator", "troubleshooting"],
    sourceDocs: ["docs/PRICE_FEED_FLOW.md", "README.md"],
  },
  "pool-management": {
    slug: "pool-management",
    title: "Pool Management",
    summary:
      "Global GMX pool liquidity controls exposed in admin, including buffer policy and direct pool deposits.",
    audience: "Gov and operator wallets responsible for the shared liquidity pool behind every basket.",
    roleTags: ["Gov", "Operator"],
    order: 7,
    lastUpdated: DOCS_LAST_UPDATED,
    networkContext: "Pool controls affect shared GMX liquidity, so one change can affect every basket using that token pool.",
    overview: [
      "These controls affect the global GMX pool, not a single basket.",
      "Only gov can change buffer amounts for a token.",
      "Direct pool deposits require both a token transfer and a follow-up vault call.",
    ],
    guides: [
      "Use /admin/pool to check shared liquidity before making any changes.",
      "Treat buffer changes as deliberate policy updates because they affect how the pool behaves.",
      "Use direct pool deposits when the shared pool needs more backing without changing basket share supply.",
    ],
    reference: [
      "Buffer updates call `gmxVault.setBufferAmount(token, amountRaw)`.",
      "Direct deposits require `ERC20(token).transfer(gmxVault, amountRaw)` followed by `gmxVault.directPoolDeposit(token)`.",
      "The UI shows human-readable amounts and converts them to token base units.",
    ],
    permissions: [
      "Only gov can change buffer settings.",
      "Any wallet with the right token balance can top up the shared pool directly.",
      "Operators should verify token support and amount precision before sending transactions.",
    ],
    flow: [
      {
        id: "buffer",
        title: "Changing Buffer Policy",
        items: [
          "Open the pool page with the gov wallet connected.",
          "Choose the token and enter the new buffer target.",
          "Submit the change and confirm the new value is live onchain.",
        ],
      },
      {
        id: "direct-deposit",
        title: "Adding More Pool Liquidity",
        items: [
          "Connect a wallet that holds the supported token you want to add.",
          "Send that token to the GMX vault.",
          "Run the follow-up pool deposit step so GMX counts the new balance correctly.",
        ],
      },
    ],
    failureModes: [
      "Buffer changes fail if the wallet does not have gov authority.",
      "Pool deposits fail if the transfer step was skipped or no new balance actually arrived.",
      "Using the wrong token precision can lead to the wrong amount being added.",
    ],
    callouts: [
      {
        tone: "info",
        title: "Global impact",
        body: "This page controls shared liquidity for the protocol. A change here can affect execution conditions across many baskets at once.",
      },
    ],
    relatedSlugs: ["operator", "security-risk", "troubleshooting"],
    sourceDocs: ["docs/GLOBAL_POOL_MANAGEMENT_FLOW.md", "README.md"],
  },
  "contracts-reference": {
    slug: "contracts-reference",
    title: "Contracts Reference",
    summary:
      "What each core contract is responsible for, and which parts of the system it controls.",
    audience: "Engineers and integrators who need to understand the contract surface before building against it.",
    roleTags: ["Operator", "Keeper", "Gov"],
    order: 8,
    lastUpdated: DOCS_LAST_UPDATED,
    networkContext: "Always resolve addresses from the active deployment config before sending reads or writes.",
    overview: [
      "The vault layer handles deposits, shares, and basket-level settings.",
      "The perp layer handles capital accounting, pricing helpers, funding, and sync jobs.",
      "The execution layer is the GMX-style vault plus its price feed.",
    ],
    guides: [
      "Use this page to identify which contract you need before writing integration code.",
      "Check permissions here before assuming the same wallet can call every admin function.",
      "Pair this page with Troubleshooting when an integration call starts reverting.",
    ],
    reference: [
      "BasketVault handles deposits, redemptions, reserve policy, and capital movement into perps.",
      "VaultAccounting handles registration, asset mapping, open and close position flow, and pause state.",
      "The oracle stack handles feed setup, relayer writes, sync jobs, and GMX feed updates.",
      "Pool controls handle global liquidity settings such as buffers and direct deposits.",
    ],
    permissions: [
      "Owner and gov privileges vary by contract and are not interchangeable.",
      "Keepers are explicitly allowlisted and should be audited per environment.",
      "Execution bots should use least-privileged keys segmented by workflow.",
    ],
    flow: [
      {
        id: "role-mapping",
        title: "Role Mapping",
        items: [
          "Map each operational workflow to exact contract role ownership.",
          "Verify on-chain owner or gov before attempting writes.",
          "Rotate keeper and operator keys with clear separation of concerns.",
        ],
      },
      {
        id: "integration-checklist",
        title: "Integration Checklist",
        items: [
          "Resolve address set from deployment config.",
          "Validate asset ids and token mappings.",
          "Dry-run read calls before first write transactions.",
        ],
      },
    ],
    failureModes: [
      "Wrong role attempting writes leads to authorization reverts.",
      "Address drift between environments causes tx execution against wrong targets.",
      "Missing mapping or registration preconditions blocks position operations.",
    ],
    callouts: [
      {
        tone: "warning",
        title: "Authority boundaries",
        body: "Do not assume one wallet controls every contract. Ownership is split across the system.",
      },
    ],
    relatedSlugs: ["operator", "oracle-price-sync", "security-risk"],
    sourceDocs: ["README.md", "MODIFICATIONS.md", "docs/ASSET_MANAGER_FLOW.md", "docs/PRICE_FEED_FLOW.md"],
  },
  troubleshooting: {
    slug: "troubleshooting",
    title: "Troubleshooting",
    summary:
      "Common failures, quick checks, and simple recovery steps for the issues operators hit most often.",
    audience: "Operators, keepers, and integrators debugging failed transactions, stale prices, or broken jobs.",
    roleTags: ["Operator", "Keeper", "Gov"],
    order: 9,
    lastUpdated: DOCS_LAST_UPDATED,
    networkContext: "Most failures come from simple mismatch problems: wrong chain, wrong config, or missing permissions.",
    overview: [
      "Start with the basics before deep debugging: wallet role, chain, and contract address.",
      "If positions fail, check registration, asset mappings, and pause state first.",
      "If prices look wrong, check freshness and whether sync jobs are still running.",
    ],
    guides: [
      "Run through preflight checklist before executing sensitive admin operations.",
      "Use read methods and admin UI status cards to isolate missing preconditions.",
      "Document incident timeline including submitted tx hashes and wallet context.",
    ],
    reference: [
      "Typical failure clusters: auth, liquidity, feed sync, mapping, and pause state.",
      "Primary operational surfaces: /admin/baskets, /admin/oracle, /admin/pool, /prices.",
      "Canonical command flows: deploy scripts, sync scripts, and funding updates in README.",
    ],
    permissions: [
      "Incident response usually needs operator plus gov coordination.",
      "Keepers need explicit on-chain permission to restore feed sync pipelines.",
      "Treat emergency pause toggles as controlled governance actions.",
    ],
    flow: [
      {
        id: "preflight",
        title: "Preflight Checks",
        items: [
          "Verify wallet role ownership against target contract.",
          "Verify active chain and deployment config addresses.",
          "Read pause flags, mappings, and balances before retry.",
        ],
      },
      {
        id: "recovery",
        title: "Recovery Sequence",
        items: [
          "Fix role or mapping preconditions first.",
          "Resync prices if feed freshness is suspect.",
          "Retry operation with minimal amount and inspect result before full-size action.",
        ],
      },
    ],
    failureModes: [
      "Retries without precondition fixes waste gas and obscure root cause.",
      "Running scripts with stale deployment config can update unintended contracts.",
      "Ignoring feed freshness can produce valid txs with wrong economic assumptions.",
    ],
    callouts: [
      {
        tone: "warning",
        title: "Incident hygiene",
        body: "Before escalating an incident, record the chain, wallet, contract address, and tx hash. Those four details solve a lot of confusion.",
      },
    ],
    relatedSlugs: ["operator", "oracle-price-sync", "security-risk"],
    sourceDocs: ["README.md", "docs/ASSET_MANAGER_FLOW.md", "docs/PRICE_FEED_FLOW.md"],
  },
  "security-risk": {
    slug: "security-risk",
    title: "Security And Risk",
    summary:
      "The main risk boundaries in the system, who holds power, and what should be watched closely in day-to-day operation.",
    audience: "Operators, governance participants, and reviewers who need the practical risk picture in plain language.",
    roleTags: ["Gov", "Operator", "Keeper"],
    order: 10,
    lastUpdated: DOCS_LAST_UPDATED,
    networkContext: "Risk posture should tighten as the environment becomes more real. Local habits are not good enough for shared testnets or production-like deployments.",
    overview: [
      "The biggest trust boundaries are the owner, gov, and keeper roles across the vault and oracle stack.",
      "Fresh prices and correct asset mappings are core safety requirements, not optional extras.",
      "Liquidity policy matters both for strategy behavior and for whether users can redeem smoothly.",
    ],
    guides: [
      "Use principle of least privilege for all operator and keeper keys.",
      "Define explicit sync and funding cadence policies with monitoring.",
      "Review reserve, buffer, and risk cap settings before scaling basket TVL.",
    ],
    reference: [
      "Centralization points: owner-only mutators, gov-only pool settings, and keeper-managed updates.",
      "Emergency controls: setPaused and role revocations.",
      "Risk parameters: max open interest, max position size, reserve bps, and buffer amounts.",
    ],
    permissions: [
      "Gov multisig for high-impact protocol parameters.",
      "Operator keys scoped to basket and strategy execution workflows.",
      "Keeper keys isolated for feed and funding updates with revocation runbook.",
    ],
    flow: [
      {
        id: "daily-risk",
        title: "Daily Risk Review",
        items: [
          "Inspect oracle freshness and sync success rates.",
          "Review pool utilization, buffer levels, and reserve coverage.",
          "Review open interest and position concentration against policy caps.",
        ],
      },
      {
        id: "change-control",
        title: "Change Control",
        items: [
          "Batch high-impact parameter updates through explicit approval workflows.",
          "Record rationale and expected effect before execution.",
          "Verify post-change metrics and rollback path readiness.",
        ],
      },
    ],
    failureModes: [
      "Single-key operations on production-like environments increase compromise blast radius.",
      "Unmonitored keeper failures silently degrade pricing reliability.",
      "Aggressive allocation and loose risk caps can amplify drawdown and redemption pressure.",
    ],
    callouts: [
      {
        tone: "warning",
        title: "High impact zone",
        body: "Buffer policy, reserve policy, and risk caps should be treated as high-impact decisions because they shape both safety and user experience.",
      },
    ],
    relatedSlugs: ["operator", "pool-management", "troubleshooting"],
    sourceDocs: ["docs/ASSET_MANAGER_FLOW.md", "docs/GLOBAL_POOL_MANAGEMENT_FLOW.md", "README.md"],
  },
};

export const DOCS_PAGES_SORTED = DOCS_SLUGS.map((slug) => DOCS_PAGES[slug]).sort(
  (a, b) => a.order - b.order
);

export function getDocsPage(slug: string): DocsPage | null {
  if (!DOCS_SLUGS.includes(slug as DocsSlug)) return null;
  return DOCS_PAGES[slug as DocsSlug];
}
