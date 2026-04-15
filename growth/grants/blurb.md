# IndexFlow -- Grant Application Blurb

Copy this text into a shared Google Doc (editable by anyone with the link) and paste the Doc URL into the grant application form.

---

IndexFlow is a perp-driven basket vault protocol that lets asset managers, issuers, and chain ecosystem partners launch structured exposure products backed by a shared perpetual liquidity layer.

Users deposit USDC, receive transferable basket shares priced from mark-to-market NAV, and redeem from idle reserves. The protocol separates portfolio value from exit liquidity, making reserve depth a hard product-quality parameter. Each chain deployment is ring-fenced with independent KPIs (TVL, volume, fees), so ecosystem support is fully attributable.

IndexFlow is not a generic perp DEX or a passive wrapper -- it is structured exposure infrastructure built for managers who need custom return schedules, custom oracles, domain-specific logic, and ring-fenced reserves.

The system combines five layers: a product layer (basket vaults that accept USDC and issue transferable shares), a shared liquidity layer (a GMX v1-derived perpetual engine), a valuation and pricing layer (auditable oracle-based NAV), a reserve and redemption layer (explicit reserve-backed exit quality), and an attribution and governance layer (chain-specific KPI tracking, cross-chain pool state synchronization via Chainlink CCIP and proportional liquidity routing, and later-stage token governance via $FLOW).

IndexFlow's core design truth is simple: portfolio value and exit liquidity are not the same thing. That distinction is the primary architectural constraint, and it produces a product model built around redemption quality, manager flexibility, and chain-attributable growth rather than raw TVL alone.
