const fs = require("fs");
const path = require("path");

const contracts = [
  "BasketVault",
  "BasketFactory",
  "BasketShareToken",
  "PerpReader",
  "VaultAccounting",
  "OracleAdapter",
  "PricingEngine",
  "FundingRateManager",
  "AssetWiring",
];

const outDir = path.join(__dirname, "..", "out");
const destFile = path.join(__dirname, "..", "apps", "web", "src", "abi", "contracts.ts");

let output = "";

for (const c of contracts) {
  const filePath = path.join(outDir, c + ".sol", c + ".json");
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  output += "export const " + c + "ABI = " + JSON.stringify(data.abi) + " as const;\n\n";
}

fs.writeFileSync(destFile, output);
console.log("Extracted " + contracts.length + " ABIs to " + destFile);
