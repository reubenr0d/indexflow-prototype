# Deployment Registry

Canonical deployment references for each supported network.

Last updated: 2026-04-07

## Network summary

| Network | Chain ID | Status | Config source |
| --- | --- | --- | --- |
| Local (Anvil) | `31337` | Deployed | app runtime uses `apps/web/src/config/sepolia-deployment.json` |
| Ethereum Sepolia | `11155111` | Deployed + verified | `apps/web/src/config/sepolia-deployment.json` |
| Arbitrum One | `42161` | Not deployed in this repo snapshot | N/A |
| Arbitrum Sepolia | `421614` | Not deployed in this repo snapshot | N/A |

## Local (Anvil)

Config file: `apps/web/src/config/local-deployment.json`

Runtime note: `anvil` in `apps/web/src/config/contracts.ts` is currently mapped to Sepolia addresses from `sepolia-deployment.json`. The local file remains as deployment output/reference.

- `basketFactory`: `0x9d4454B023096f34B160D6B654540c56A1F81688`
- `vaultAccounting`: `0xc3e53F4d16Ae77Db1c982e75a937B9f60FE63690`
- `oracleAdapter`: `0x4A679253410272dd5232B3Ff7cF5dbB88f295319`
- `perpReader`: `0x998abeb3E57409262aE5b751f60747921B33613E`
- `pricingEngine`: `0xa82fF9aFd8f496c3d6ac40E2a0F282E47488CFc9`
- `fundingRateManager`: `0x1613beB3B2C4f22Ee086B2b38C1476A3cE7f78E8`
- `priceSync`: `0x70e0bA845a1A0F2DA3359C97E0285013525FFC49`
- `usdc`: `0x5FbDB2315678afecb367f032d93F642f64180aa3`
- `gmxVault`: `0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6`

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
  - `npm run deploy:local`
- Sepolia:
  - `npm run deploy:sepolia`
  - Optional verify pass:
    - `forge script script/DeploySepolia.s.sol:DeploySepolia --rpc-url sepolia --private-key $PRIVATE_KEY --broadcast --resume --verify -vvv`

Then update this file from:

- `apps/web/src/config/local-deployment.json`
- `apps/web/src/config/sepolia-deployment.json`
