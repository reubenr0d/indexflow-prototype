# Deployment Registry

Canonical deployment references for each supported network.

Last updated: 2026-04-10

## Network summary

| Network | Chain ID | Status | Config source |
| --- | --- | --- | --- |
| Local (Anvil) | `31337` | Deployed | `apps/web/src/config/local-deployment.json` |
| Ethereum Sepolia | `11155111` | Deployed + verified | `apps/web/src/config/sepolia-deployment.json` |
| Arbitrum One | `42161` | Not deployed in this repo snapshot | N/A |
| Arbitrum Sepolia | `421614` | Not deployed in this repo snapshot | N/A |

## Local (Anvil)

Config file: `apps/web/src/config/local-deployment.json`

Runtime note: the web app maps `anvil` to local deployment addresses, persists the selected target in browser `localStorage`, and keeps it aligned with the wallet chain selector in the connect button.

Subgraph note: when `NEXT_PUBLIC_SUBGRAPH_URL` is configured, the app enables subgraph reads for both `anvil` and `sepolia`.
If the subgraph URL is unset, unavailable, or returns unusable rows, the app falls back to RPC data paths.

- `basketFactory`: `0xD5ac451B0c50B9476107823Af206eD814a2e2580`
- `vaultAccounting`: `0x7A9Ec1d04904907De0ED7b6839CcdD59c3716AC9`
- `oracleAdapter`: `0xfbC22278A96299D91d41C453234d97b4F5Eb9B2d`
- `perpReader`: `0x720472c8ce72c2A2D711333e064ABD3E6BbEAdd3`
- `pricingEngine`: `0x86A2EE8FAf9A840F7a2c64CA3d51209F9A02081D`
- `fundingRateManager`: `0xA4899D35897033b927acFCf422bc745916139776`
- `priceSync`: `0xe8D2A1E88c91DCd5433208d4152Cc4F399a7e91d`
- `usdc`: `0xcbEAF3BDe82155F56486Fb5a1072cb8baAf547cc`
- `gmxVault`: `0x04C89607413713Ec9775E14b954286519d836FEf`

## Ethereum Sepolia

Config file: `apps/web/src/config/sepolia-deployment.json`

- Deployment sender (latest successful run): `0x5083D5fa3690c2F6aB07f0C6E76DF4938287c7B9`
- Broadcast status: `ONCHAIN EXECUTION COMPLETE & SUCCESSFUL`
- Verification status: all submitted contracts verified on Etherscan

Addresses:

- `basketFactory`: `0xBaBd358731e88d5A61AaB2fb0F142bEcCd8140AE`  
  https://sepolia.etherscan.io/address/0xBaBd358731e88d5A61AaB2fb0F142bEcCd8140AE
- `vaultAccounting`: `0xbEBc462234Ec50f95512E139B37620c2Cc0004B4`  
  https://sepolia.etherscan.io/address/0xbEBc462234Ec50f95512E139B37620c2Cc0004B4
- `oracleAdapter`: `0x437709EEC882CdaD9c51Cc23aF270C016F9cC12a`  
  https://sepolia.etherscan.io/address/0x437709EEC882CdaD9c51Cc23aF270C016F9cC12a
- `perpReader`: `0xBD019190BE59f85FA434BF8b50Ccd3Be489cfB61`  
  https://sepolia.etherscan.io/address/0xBD019190BE59f85FA434BF8b50Ccd3Be489cfB61
- `pricingEngine`: `0xF4bd48D20eF86A18C77aC087Ea9C3c18875cB866`  
  https://sepolia.etherscan.io/address/0xF4bd48D20eF86A18C77aC087Ea9C3c18875cB866
- `fundingRateManager`: `0xBb7712270772E54C30e209C4d48bb48027d123d6`  
  https://sepolia.etherscan.io/address/0xBb7712270772E54C30e209C4d48bb48027d123d6
- `priceSync`: `0x4f21b3b3F8DaB982b0c60582CfAbcCa7a9E39589`  
  https://sepolia.etherscan.io/address/0x4f21b3b3F8DaB982b0c60582CfAbcCa7a9E39589
- `usdc`: `0xa35c4A5Df6b135F67B61369756f4dCA86B99CC30`  
  https://sepolia.etherscan.io/address/0xa35c4A5Df6b135F67B61369756f4dCA86B99CC30
- `gmxVault`: `0xC37c372f9477b2C8324B93B4d52336400FF46f8C`  
  https://sepolia.etherscan.io/address/0xC37c372f9477b2C8324B93B4d52336400FF46f8C

## How to refresh

- Local:
  - `npm run deploy:local` (requires Node + network for live Yahoo `BHP` seed, or set `SEED_PRICE_RAW` to pin the initial oracle price)
  - Full local stack (fresh Anvil + contracts + subgraph + UI): `npm run local:up`
  - Teardown/reset volumes: `npm run local:down`
- Sepolia:
  - `npm run deploy:sepolia` (same Yahoo seed behavior; optional `SEED_PRICE_RAW` override)
  - Optional verify pass:
    - `forge script script/DeploySepolia.s.sol:DeploySepolia --rpc-url sepolia --private-key $PRIVATE_KEY --broadcast --resume --verify -vvv`

Then update this file from:

- `apps/web/src/config/local-deployment.json`
- `apps/web/src/config/sepolia-deployment.json`
