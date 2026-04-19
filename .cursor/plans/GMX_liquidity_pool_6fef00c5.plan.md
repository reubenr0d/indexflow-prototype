---
name: Secondary market composability
overview: Add secondary market liquidity as an explicit benefit across docs and the blog post, plus code enhancements (EIP-2612 Permit, ERC-4626 adapter, NAV oracle) to improve DeFi composability.
todos:
  - id: permit-share-token
    content: Add EIP-2612 Permit to BasketShareToken for gasless approvals
    status: pending
  - id: erc4626-adapter
    content: Create ERC-4626 view adapter for DeFi composability
    status: pending
  - id: nav-oracle
    content: Create NAV oracle interface for lending/liquidation protocols
    status: pending
  - id: blog-secondary-section
    content: Add secondary market liquidity section to the blog post
    status: pending
  - id: investor-flow-secondary
    content: Add secondary market exit path section to INVESTOR_FLOW.md
    status: pending
  - id: whitepaper-expand
    content: Expand transferable shares paragraph in WHITEPAPER_DRAFT.md
    status: pending
  - id: regulatory-clarify
    content: Add clarifying note to REGULATORY_ROADMAP_DRAFT.md about permissionless framing
    status: pending
  - id: tests-secondary
    content: Add tests for Permit, ERC-4626 adapter, and NAV oracle
    status: pending
  - id: tech-arch-update
    content: Update TECHNICAL_ARCHITECTURE_AND_ROADMAP.md ERC-4626 section
    status: pending
  - id: changelog-update
    content: Update CHANGELOG.md with new features
    status: pending
isProject: false
---

# Secondary Market Liquidity Documentation Update

## Summary

The code already supports secondary trading - `BasketShareToken` is a "Transferable ERC20" inheriting standard `transfer()`/`transferFrom()`. The gap is documentation doesn't surface this as a benefit.

**Key framing:** IndexFlow issues transferable shares that can trade on any DEX/OTC. The protocol *enables* secondary trading without *operating* a market - preserving the permissionless regulatory model.

---

## Changes

### 1. Blog Post: Add Secondary Market Section

**File:** `[content/blog/if-you-run-money-the-old-way-crypto-question.md](content/blog/if-you-run-money-the-old-way-crypto-question.md)`

Insert new section after line 51 (after "The part that is easy to miss") and before "Where IndexFlow fits":

```markdown
## The part traditional structures cannot offer: secondary liquidity

Traditional private funds enforce lock-ups and limited redemption windows. Investors wait for quarterly gates, submit notice periods, and hope the fund has capacity when their turn comes.

Tokenized basket shares are transferable ERC20s. That creates an exit path that does not exist in traditional structures: sell your position on a secondary market -- DEX, OTC, or peer-to-peer -- without waiting for redemption windows or competing for limited liquidity.

This is not a claim that secondary prices will match NAV. They may trade at a discount during stress or a premium during demand spikes, the same dynamic that affects closed-end funds. But optionality has value. An investor who needs liquidity on Tuesday does not care that the fund's redemption window opens on Friday.

The protocol does not operate a secondary market. It issues transferable shares. Where those shares trade is a downstream market decision, not a protocol function. That separation matters for both regulatory clarity and product design.
```

### 2. Investor Flow: Add Secondary Exit Path

**File:** `[docs/INVESTOR_FLOW.md](docs/INVESTOR_FLOW.md)`

Add new section after "Redeem (with pending queue for cross-chain fills)" (around line 26):

```markdown
### Secondary market exit (transferable shares)

Basket shares are transferable ERC20 tokens. Holders can sell shares on secondary markets (DEXs, OTC, peer-to-peer) at any time without using the protocol's redemption path.

- **No lock-up:** Unlike traditional fund structures with quarterly gates and notice periods, share transfers are immediate.
- **Price discovery:** Secondary prices may diverge from NAV (discount or premium), similar to closed-end funds.
- **Protocol role:** IndexFlow issues transferable shares but does not operate a secondary market. Where shares trade is a downstream market decision.

This creates an exit option independent of vault liquidity. During stress, when primary redemptions may queue, secondary markets provide an alternative path -- at market-clearing prices.
```

### 3. Whitepaper: Expand "Basket Lifecycle" Section

**File:** `[docs/WHITEPAPER_DRAFT.md](docs/WHITEPAPER_DRAFT.md)`

Expand the paragraph around line 76 that mentions "transferable basket shares":

After:

> In return, the user receives transferable basket shares that represent a proportional claim on that product.

Add:

> Because shares are standard ERC20 tokens, they can trade on secondary markets -- DEXs, OTC desks, or peer-to-peer -- without using the protocol's redemption path. This creates an exit option that traditional fund structures cannot offer: liquidity independent of redemption windows, queue depth, or primary market capacity. Secondary prices may diverge from NAV, but optionality has value for investors who need liquidity before the next redemption window.

### 4. Regulatory Roadmap: Clarify Permissionless Framing

**File:** `[docs/REGULATORY_ROADMAP_DRAFT.md](docs/REGULATORY_ROADMAP_DRAFT.md)`

Around line 517, the doc lists "operating a secondary market or order matching for basket shares" as a risk. Add a clarifying paragraph before that list:

```markdown
**Note on secondary trading:** The protocol issues transferable ERC20 shares. Holders can trade these shares on any secondary market (DEXs, OTC) without protocol involvement. This is standard ERC20 behavior, not a protocol-operated market. The risk item below refers specifically to IndexFlow (or a related entity) actively operating or matching orders -- which would create additional regulatory surface.
```

---

## Code Changes

### 1. EIP-2612 Permit on BasketShareToken

**File:** `[src/vault/BasketShareToken.sol](src/vault/BasketShareToken.sol)`

Add gasless approval support for DEX trading. Inherit from OpenZeppelin's `ERC20Permit`:

```solidity
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

contract BasketShareToken is ERC20, ERC20Permit {
    // ... existing code ...
    
    constructor(string memory name_, string memory symbol_, address vault_) 
        ERC20(name_, symbol_) 
        ERC20Permit(name_)  // EIP-712 domain uses token name
    {
        // ...
    }
    
    // Override nonces if needed for ERC20Permit compatibility
}
```

### 2. ERC-4626 View Adapter

**File:** `[src/vault/BasketVault4626Adapter.sol](src/vault/BasketVault4626Adapter.sol)` (new file)

Create a read-only adapter that implements ERC-4626 view methods, wrapping `BasketVault` for DeFi composability:

```solidity
/// @title BasketVault4626Adapter
/// @notice Read-only ERC-4626 compatible view adapter for BasketVault.
/// @dev Does not implement deposit/withdraw/mint/redeem - those require direct vault interaction
/// due to async redemption queue. Provides view methods for DeFi integrations.
contract BasketVault4626Adapter {
    BasketVault public immutable vault;
    
    function asset() external view returns (address);           // returns vault.usdc()
    function totalAssets() external view returns (uint256);     // returns vault.getPricingNav()
    function convertToShares(uint256 assets) external view returns (uint256);
    function convertToAssets(uint256 shares) external view returns (uint256);
    function maxDeposit(address) external view returns (uint256);
    function maxMint(address) external view returns (uint256);
    function maxWithdraw(address owner) external view returns (uint256);
    function maxRedeem(address owner) external view returns (uint256);
    function previewDeposit(uint256 assets) external view returns (uint256);
    function previewMint(uint256 shares) external view returns (uint256);
    function previewWithdraw(uint256 assets) external view returns (uint256);
    function previewRedeem(uint256 shares) external view returns (uint256);
}
```

### 3. NAV Oracle Interface

**File:** `[src/vault/BasketSharePriceOracle.sol](src/vault/BasketSharePriceOracle.sol)` (new file)

Create a standardized price oracle that external protocols can consume for lending, liquidations, etc:

```solidity
/// @title BasketSharePriceOracle
/// @notice Chainlink-compatible price feed interface for basket share tokens.
/// @dev Returns share price in USDC terms (8 decimals for Chainlink compatibility).
contract BasketSharePriceOracle {
    BasketVault public immutable vault;
    
    /// @notice Chainlink AggregatorV3Interface compatible
    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,      // share price in 8 decimals
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    );
    
    function decimals() external pure returns (uint8);  // returns 8
    function description() external view returns (string memory);
    function version() external pure returns (uint256);
}
```

### 4. Update Tests

Add tests for:

- Permit signature verification on BasketShareToken
- ERC-4626 adapter view method accuracy
- NAV oracle price feed correctness

### 5. Update Technical Architecture Doc

**File:** `[docs/TECHNICAL_ARCHITECTURE_AND_ROADMAP.md](docs/TECHNICAL_ARCHITECTURE_AND_ROADMAP.md)`

Update the "ERC-4626 alignment and current deviations" section (around line 163) to mention the new adapter.

### 6. Update CHANGELOG

**File:** `[CHANGELOG.md](CHANGELOG.md)`

Add entries under `## [Unreleased]`:

- Added: EIP-2612 Permit support on BasketShareToken for gasless approvals
- Added: BasketVault4626Adapter for ERC-4626 view compatibility
- Added: BasketSharePriceOracle for Chainlink-compatible share price feeds
- Added: Secondary market exit documentation across investor flow, whitepaper, and blog

